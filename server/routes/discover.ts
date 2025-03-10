import { TMDB } from "tmdb-ts";
const tmdb = new TMDB(useRuntimeConfig().tmdbApiKey)
export default defineCachedEventHandler(async (event) => {
    const popular = { movies: [], shows: [] }
    popular.movies.push(...((data) => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(await tmdb.movies.popular())); // Sorts by vote average
    popular.shows.push(...((data) => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(await tmdb.tvShows.popular())); // Sorts by vote average

    const genres = {
        movies: await tmdb.genres.movies(),
        shows: await tmdb.genres.tvShows()
    }
    const topRated = {
        movies: await tmdb.movies.topRated(),
        shows: await tmdb.tvShows.topRated()
    }
    const nowPlaying = {
        movies: (await tmdb.movies.nowPlaying()).results.sort((a, b) => b.vote_average - a.vote_average),
        shows: (await tmdb.tvShows.onTheAir()).results.sort((a, b) => b.vote_average - a.vote_average)
    }

    return {
      popular,
      topRated,
      nowPlaying,
      genres
    };
}, {
    maxAge: process.env.NODE_ENV === 'production' ? 20 * 60 : 0 // 20 Minutes for prod, no cache for dev. Customize to your liking
});
