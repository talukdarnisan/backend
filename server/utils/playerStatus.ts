// Interface for player status
export interface PlayerStatus {
  userId: string;
  roomCode: string;
  isHost: boolean;
  content: {
    title: string;
    type: string;
    tmdbId?: number | string;
    seasonId?: number;
    episodeId?: number;
    seasonNumber?: number;
    episodeNumber?: number;
  };
  player: {
    isPlaying: boolean;
    isPaused: boolean;
    isLoading: boolean;
    hasPlayedOnce: boolean;
    time: number;
    duration: number;
    volume: number;
    playbackRate: number;
    buffered: number;
  };
  timestamp: number;
}

// In-memory store for player status data
// Key: userId+roomCode, Value: Status data array
export const playerStatusStore = new Map<string, Array<PlayerStatus>>();

// Cleanup interval (1 minute in milliseconds)
export const CLEANUP_INTERVAL = 1 * 60 * 1000;

// Clean up old status entries
function cleanupOldStatuses() {
  const cutoffTime = Date.now() - CLEANUP_INTERVAL;

  for (const [key, statuses] of playerStatusStore.entries()) {
    const filteredStatuses = statuses.filter(status => status.timestamp >= cutoffTime);

    if (filteredStatuses.length === 0) {
      playerStatusStore.delete(key);
    } else {
      playerStatusStore.set(key, filteredStatuses);
    }
  }
}

// Schedule cleanup every 1 minute
setInterval(cleanupOldStatuses, 1 * 60 * 1000);
