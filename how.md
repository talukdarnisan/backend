# How This Backend Works

This document explains the core functionalities of this backend, focusing on how player status is managed. It's important to note that **this backend does not directly handle the acquisition or provision of streaming links or URLs.** Instead, it focuses on synchronizing player status among users, likely for a shared viewing experience (e.g., a "watch party" feature). The client-side application is expected to handle the discovery and playback of streaming content.

## Core Functionalities

This backend is a Node.js/TypeScript application, likely built with a framework like Nuxt.js or Nitro. It uses a PostgreSQL database via Prisma and provides the following main features:

*   **User Management:** Handles user authentication (login, registration), user profiles, sessions, and settings.
*   **Media & Content:** Manages user bookmarks, ratings, progress tracking for media, and user-created lists. It also integrates with external services like Letterboxd and potentially Trakt.
*   **Metrics:** Collects and processes various metrics, including daily, weekly, monthly statistics, captcha data, and provider-specific metrics.
*   **Background Jobs:** Executes scheduled tasks, such as clearing old metric data.
*   **Player Status Synchronization:** This is the focus of the `player` API endpoints and related utilities, enabling real-time updates of media playback status across multiple users in a shared "room."

## Player Status Management (Code by Code, Line by Line)

The following files are central to how player status is managed in this backend:

### `/workspaces/backend/server/utils/playerStatus.ts`

This file defines the data structure for player status and sets up an in-memory store to keep track of active player sessions. It also includes a mechanism to clean up old status entries.

```typescript
// Interface for player status
export interface PlayerStatus { // Defines the structure of a PlayerStatus object.
  userId: string; // Unique identifier for the user.
  roomCode: string; // A code identifying the shared viewing room.
  isHost: boolean; // A boolean indicating if the user is the host of the room.
  content: { // An object containing details about the media content being played.
    title: string; // The title of the content.
    type: string; // The type of content (e.g., 'movie', 'episode').
    tmdbId?: number | string; // Optional: The TMDb ID for the content.
    seasonId?: number; // Optional: The season ID if the content is an episode.
    episodeId?: number; // Optional: The episode ID if the content is an episode.
    seasonNumber?: number; // Optional: The season number if the content is an episode.
    episodeNumber?: number; // Optional: The episode number if the content is an episode.
  };
  player: { // An object containing details about the player's current state.
    isPlaying: boolean; // Boolean: true if content is currently playing.
    isPaused: boolean; // Boolean: true if content is currently paused.
    isLoading: boolean; // Boolean: true if content is currently loading.
    hasPlayedOnce: boolean; // Boolean: true if content has played at least once.
    time: number; // The current playback time in seconds.
    duration: number; // The total duration of the content in seconds.
    volume: number; // The player's volume level.
    playbackRate: number; // The playback speed (e.g., 1 for normal).
    buffered: number; // The amount of content buffered in seconds.
  };
  timestamp: number; // A timestamp (milliseconds since epoch) indicating when this status was recorded.
}

// In-memory store for player status data
// Key: userId+roomCode, Value: Status data array
export const playerStatusStore = new Map<string, Array<PlayerStatus>>(); // Initializes a JavaScript Map to store player status data. The key for each entry is a string combining `userId` and `roomCode` (e.g., "user123:roomABC"), and the value is an array of `PlayerStatus` objects. This allows storing a history of recent statuses for each user within a specific room.

// Cleanup interval (1 minute in milliseconds)
export const CLEANUP_INTERVAL = 1 * 60 * 1000; // Defines a constant for the cleanup interval, set to 1 minute (60,000 milliseconds). This determines how long a status entry is considered "recent" before it might be cleaned up.

// Clean up old status entries
function cleanupOldStatuses() { // Declares a function responsible for removing outdated player status entries from the `playerStatusStore`.
  const cutoffTime = Date.now() - CLEANUP_INTERVAL; // Calculates a `cutoffTime`. Any status with a `timestamp` older than this will be considered old and potentially removed.

  for (const [key, statuses] of playerStatusStore.entries()) { // Iterates over each key-value pair (e.g., "userId:roomCode" and its array of statuses) in the `playerStatusStore`.
    const filteredStatuses = statuses.filter(status => status.timestamp >= cutoffTime); // For each array of statuses, it filters out any `PlayerStatus` objects whose `timestamp` is older than the `cutoffTime`, keeping only the recent ones.

    if (filteredStatuses.length === 0) { // Checks if, after filtering, there are no recent statuses left for a particular `key` (user in a room).
      playerStatusStore.delete(key); // If no recent statuses, the entire entry for that `key` is removed from the `playerStatusStore`.
    } else { // If there are still recent statuses for the `key`...
      playerStatusStore.set(key, filteredStatuses); // ...the `playerStatusStore` entry for that `key` is updated with the `filteredStatuses` (only the recent ones).
    }
  }
}

// Schedule cleanup every 1 minute
setInterval(cleanupOldStatuses, 1 * 60 * 1000); // Uses `setInterval` to schedule the `cleanupOldStatuses` function to run every 1 minute (60,000 milliseconds). This ensures that the `playerStatusStore` is regularly pruned of old data.
```

### `/workspaces/backend/server/api/player/status.post.ts`

This endpoint handles incoming POST requests to update a user's player status within a specific room. It receives player state information from the client and stores it in the in-memory `playerStatusStore`.

```typescript
import { defineEventHandler, readBody, createError } from 'h3'; // Imports `defineEventHandler` to create an API route, `readBody` to parse the request body, and `createError` to generate HTTP errors from the 'h3' library.
import { playerStatusStore, PlayerStatus } from '~/utils/playerStatus'; // Imports the `playerStatusStore` (the in-memory data store) and the `PlayerStatus` interface from the local `playerStatus` utility file.

export default defineEventHandler(async event => { // Exports a default asynchronous event handler function that will be executed when a POST request is made to this API endpoint.
  const body = await readBody(event); // Asynchronously reads and parses the JSON body of the incoming HTTP request. This body is expected to contain the player status update.

  if (!body || !body.userId || !body.roomCode) { // Checks if the request body is missing or if it doesn't contain the essential `userId` or `roomCode` fields.
    throw createError({ // If required fields are missing, it throws an HTTP error with a 400 status code (Bad Request).
      statusCode: 400,
      statusMessage: 'Missing required fields: userId, roomCode',
    });
  }

  const status: PlayerStatus = { // Creates a new `PlayerStatus` object, populating its fields from the parsed request `body`.
    userId: body.userId, // Assigns the `userId` from the request body.
    roomCode: body.roomCode, // Assigns the `roomCode` from the request body.
    isHost: body.isHost || false, // Assigns `isHost` from the request body, defaulting to `false` if not provided.
    content: { // Creates a `content` object to store details about the media being played.
      title: body.content?.title || 'Unknown', // Assigns the content `title`, defaulting to 'Unknown' if not provided.
      type: body.content?.type || 'Unknown', // Assigns the content `type`, defaulting to 'Unknown' if not provided.
      tmdbId: body.content?.tmdbId, // Assigns the optional `tmdbId`.
      seasonId: body.content?.seasonId, // Assigns the optional `seasonId`.
      episodeId: body.content?.episodeId, // Assigns the optional `episodeId`.
      seasonNumber: body.content?.seasonNumber, // Assigns the optional `seasonNumber`.
      episodeNumber: body.content?.episodeNumber, // Assigns the optional `episodeNumber`.
    },
    player: { // Creates a `player` object to store the current state of the media player.
      isPlaying: body.player?.isPlaying || false, // Assigns `isPlaying`, defaulting to `false`.
      isPaused: body.player?.isPaused || false, // Assigns `isPaused`, defaulting to `false`.
      isLoading: body.player?.isLoading || false, // Assigns `isLoading`, defaulting to `false`.
      hasPlayedOnce: body.player?.hasPlayedOnce || false, // Assigns `hasPlayedOnce`, defaulting to `false`.
      time: body.player?.time || 0, // Assigns the current `time` in seconds, defaulting to `0`.
      duration: body.player?.duration || 0, // Assigns the `duration` in seconds, defaulting to `0`.
      volume: body.player?.volume || 0, // Assigns the `volume`, defaulting to `0`.
      playbackRate: body.player?.playbackRate || 1, // Assigns the `playbackRate`, defaulting to `1`.
      buffered: body.player?.buffered || 0, // Assigns the `buffered` amount in seconds, defaulting to `0`.
    },
    timestamp: Date.now(), // Sets the `timestamp` of this status update to the current time in milliseconds.
  };

  const key = `${status.userId}:${status.roomCode}`; // Constructs a unique `key` string by concatenating `userId` and `roomCode` for use with the `playerStatusStore`.
  const existingStatuses = playerStatusStore.get(key) || []; // Retrieves the array of existing `PlayerStatus` objects associated with this `key` from the `playerStatusStore`. If no entry exists, it defaults to an empty array.

  // Add new status and keep only the last 5 statuses
  existingStatuses.push(status); // Adds the newly created `status` object to the end of the `existingStatuses` array.
  if (existingStatuses.length > 5) { // Checks if the `existingStatuses` array now contains more than 5 entries.
    existingStatuses.shift(); // If it does, the oldest status (the first element in the array) is removed to maintain a maximum of 5 recent statuses.
  }

  playerStatusStore.set(key, existingStatuses); // Updates the `playerStatusStore` with the modified `existingStatuses` array for the given `key`.

  return { success: true, timestamp: status.timestamp }; // Returns a JSON response indicating success and the timestamp of the recorded status.
});
```

### `/workspaces/backend/server/api/player/status.get.ts`

This endpoint handles incoming GET requests to retrieve player status information. It can return the status for a specific user in a room, or all statuses for a given room.

```typescript
import { defineEventHandler, getQuery, createError } from 'h3'; // Imports `defineEventHandler` to create an API route, `getQuery` to extract query parameters, and `createError` to generate HTTP errors from the 'h3' library.
import { playerStatusStore, CLEANUP_INTERVAL } from '~/utils/playerStatus'; // Imports the `playerStatusStore` (the in-memory data store) and `CLEANUP_INTERVAL` from the local `playerStatus` utility file.

export default defineEventHandler(event => { // Exports a default event handler function that will be executed when a GET request is made to this API endpoint.
  const query = getQuery(event); // Extracts all query parameters from the incoming HTTP request.
  const userId = query.userId as string; // Attempts to extract the `userId` query parameter, casting it to a string.
  const roomCode = query.roomCode as string; // Attempts to extract the `roomCode` query parameter, casting it to a string.

  // If roomCode is provided but no userId, return all statuses for that room
  if (roomCode && !userId) { // This block executes if a `roomCode` is provided in the query parameters, but `userId` is not.
    const cutoffTime = Date.now() - CLEANUP_INTERVAL; // Calculates a `cutoffTime` to filter out old status entries, using the `CLEANUP_INTERVAL`.
    const roomStatuses: Record<string, any[]> = {}; // Initializes an empty object to store player statuses, grouped by `userId`, for the specified room.

    for (const [key, statuses] of playerStatusStore.entries()) { // Iterates over each key-value pair in the `playerStatusStore`.
      if (key.includes(`:${roomCode}`)) { // Checks if the current `key` (e.g., "userId:roomCode") contains the `roomCode` being queried, indicating it belongs to the target room.
        const userId = key.split(':')[0]; // Extracts the `userId` from the `key` string.
        const recentStatuses = statuses.filter(status => status.timestamp >= cutoffTime); // Filters the array of statuses for the current `key`, keeping only those whose `timestamp` is newer than or equal to the `cutoffTime`.

        if (recentStatuses.length > 0) { // If there are any `recentStatuses` for this `userId` in the room...
          roomStatuses[userId] = recentStatuses; // ...they are added to the `roomStatuses` object, with the `userId` as the key.
        }
      }
    }

    return { // Returns a JSON object containing the `roomCode` and the `users` object, which holds the recent statuses for all users in that room.
      roomCode,
      users: roomStatuses,
    };
  }

  // If both userId and roomCode are provided, return status for that user in that room
  if (userId && roomCode) { // This block executes if both `userId` and `roomCode` are provided in the query parameters.
    const key = `${userId}:${roomCode}`; // Constructs the unique `key` string for the `playerStatusStore` using the provided `userId` and `roomCode`.
    const statuses = playerStatusStore.get(key) || []; // Retrieves the array of `PlayerStatus` objects associated with this specific `key` from the `playerStatusStore`. If no entry exists, it defaults to an empty array.

    // Remove statuses older than 15 minutes
    const cutoffTime = Date.now() - CLEANUP_INTERVAL; // Calculates a `cutoffTime` to filter out old status entries.
    const recentStatuses = statuses.filter(status => status.timestamp >= cutoffTime); // Filters the retrieved `statuses` array, keeping only those whose `timestamp` is newer than or equal to the `cutoffTime`.

    if (recentStatuses.length !== statuses.length) { // Checks if any old statuses were filtered out (i.e., if the length of `recentStatuses` is different from the original `statuses` array).
      playerStatusStore.set(key, recentStatuses); // If old statuses were removed, the `playerStatusStore` is updated with the `recentStatuses` for this `key`.
    }

    return { // Returns a JSON object containing the `userId`, `roomCode`, and the `recentStatuses` for that specific user in that room.
      userId,
      roomCode,
      statuses: recentStatuses,
    };
  }

  // If neither is provided, return error
  throw createError({ // This block executes if neither `roomCode` nor `userId` (or both) are missing from the query parameters.
    statusCode: 400,
    statusMessage: 'Missing required query parameters: roomCode and/or userId', // Throws an HTTP error with a 400 status code, indicating that required query parameters are missing.
  });
});
```
