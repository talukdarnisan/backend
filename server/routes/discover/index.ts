import { TMDB } from 'tmdb-ts';
const tmdb = new TMDB(useRuntimeConfig().tmdbApiKey);
import { trakt } from '#imports';

export default defineCachedEventHandler(
  async event => {
    const popular = { movies: [], shows: [] };
    popular.movies.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.movies.popular()
      )
    ); // Sorts by vote average
    popular.shows.push(
      ...(data => (data.results.sort((a, b) => b.vote_average - a.vote_average), data.results))(
        await tmdb.tvShows.popular()
      )
    ); // Sorts by vote average

    const genres = {
      movies: await tmdb.genres.movies(),
      shows: await tmdb.genres.tvShows(),
    };
    const topRated = {
      movies: await tmdb.movies.topRated(),
      shows: await tmdb.tvShows.topRated(),
    };
    const nowPlaying = {
      movies: (await tmdb.movies.nowPlaying()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
      shows: (await tmdb.tvShows.onTheAir()).results.sort(
        (a, b) => b.vote_average - a.vote_average
      ),
    };
    let lists = [];

    const internalLists = {
      trending: await trakt.lists.trending(),
      popular: await trakt.lists.popular(),
    };

    for (let list = 0; list < internalLists.trending.length; list++) {
      const items = await trakt.lists.items({
        id: internalLists.trending[list].list.ids.trakt,
        type: 'all',
      });
      lists.push({
        name: internalLists.trending[list].list.name,
        likes: internalLists.trending[list].like_count,
        items: [],
      });
      for (let item = 0; item < items.length; item++) {
        switch (true) {
          case !!items[item].movie?.ids?.tmdb:
            lists[list].items.push({
              type: 'movie',
              name: items[item].movie.title,
              id: items[item].movie.ids.tmdb,
              year: items[item].movie.year,
            });
            break;
          case !!items[item].show?.ids?.tmdb:
            lists[list].items.push({
              type: 'show',
              name: items[item].show.title,
              id: items[item].show.ids.tmdb,
              year: items[item].show.year,
            });
            break;
        }
      }
    }

    for (let list = 0; list < internalLists.popular.length; list++) {
      const items = await trakt.lists.items({
        id: internalLists.popular[list].list.ids.trakt,
        type: 'all',
      });
      lists.push({
        name: internalLists.popular[list].list.name,
        likes: internalLists.popular[list].like_count,
        items: [],
      });
      for (let item = 0; item < items.length; item++) {
        switch (true) {
          case !!items[item].movie?.ids?.tmdb:
            lists[lists.length - 1].items.push({
              type: 'movie',
              name: items[item].movie.title,
              id: items[item].movie.ids.tmdb,
              year: items[item].movie.year,
            });
            break;
          case !!items[item].show?.ids?.tmdb:
            lists[lists.length - 1].items.push({
              type: 'show',
              name: items[item].show.title,
              id: items[item].show.ids.tmdb,
              year: items[item].show.year,
            });
            break;
        }
      }
    }
    const trending = await trakt.movies.popular();

    // most watched films
    const mostWatched = await trakt.movies.watched();
    // takes the highest grossing box office film in the last weekend
    const lastWeekend = await trakt.movies.boxoffice();

    return {
      mostWatched,
      lastWeekend,
      trending,
      popular,
      topRated,
      nowPlaying,
      genres,
      traktLists: lists,
    };
  },
  {
    maxAge: process.env.NODE_ENV === 'production' ? 60 * 60 : 0, // 20 Minutes for prod, no cache for dev. Customize to your liking
  }
);
