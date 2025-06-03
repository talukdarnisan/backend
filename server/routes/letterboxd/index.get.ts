import * as cheerio from 'cheerio';
import { TMDB } from 'tmdb-ts';
const tmdb = new TMDB(useRuntimeConfig().tmdbApiKey);

export default defineCachedEventHandler(async (event) => {
  try {
    const response = await fetch('https://letterboxd.com/lists/');
    let html = await response.text();
    
    html = html.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    
    const $ = cheerio.load(html);
    
    const listItems = $('a.list-link').map((i, el) => ({
      href: $(el).attr('href'),
      title: $(el).find('.list-name').text().trim() || $(el).attr('title'),
      text: $(el).text().trim()
    })).get();
    
    if (!listItems.length) {
      return { 
        lists: [],
        error: 'No lists found'
      };
    }

    const allLists = [];

    for (let i = 0; i < listItems.length; i++) {
      const listItem = listItems[i];
      
      if (!listItem.href) continue;

      try {
        const listUrl = `https://letterboxd.com${listItem.href}`;
        const listResponse = await fetch(listUrl);
        let listHtml = await listResponse.text();
        
        listHtml = listHtml.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        
        const list$ = cheerio.load(listHtml);
        
        const ogTitle = list$('meta[property="og:title"]').attr('content');
        const listName = ogTitle || listItem.title;
        
        const listStatsText = list$('.list-meta .stats').text();
        const itemCountMatch = listStatsText.match(/(\d+)\s*film/i);
        const expectedItemCount = itemCountMatch ? parseInt(itemCountMatch[1]) : null;
        
        const possibleFilmSelectors = [
          'li.poster-container',
          '.poster-container', 
          '.film-poster',
          '.poster',
          'li[data-film-slug]',
          '[data-film-slug]',
          '.listitem',
          '.list-item'
        ];
        
        let films = [];
        let workingSelector = '';
        
        for (const selector of possibleFilmSelectors) {
          const elements = list$(selector);
          if (elements.length > 0) {
            workingSelector = selector;
            films = elements.map((i, el) => {
              const filmSlug = list$(el).attr('data-film-slug');
              const targetLink = list$(el).attr('data-target-link');
              const filmId = list$(el).attr('data-film-id');
              
              const filmName = filmSlug 
                ? filmSlug.split('-').map(word => 
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')
                : targetLink?.split('/film/')[1]?.split('/')[0]?.replace(/-/g, ' ');
              
              return {
                name: filmName,
                slug: filmSlug,
                link: targetLink,
                filmId: filmId
              };
            }).get().filter(film => film.name);
            
            if (films.length > 0) break;
          }
        }

        const tmdbIds = [];
        
        for (const film of films) {
          try {
            const searchResult = await tmdb.search.movies({ query: film.name });
            
            if (searchResult.results && searchResult.results.length > 0) {
              const tmdbId = searchResult.results[0].id;
              tmdbIds.push(tmdbId);
            }
          } catch (error) {
            continue;
          }
        }
        
        allLists.push({
          listName: listName,
          listUrl: listUrl,
          tmdbIds,
          metadata: {
            originalFilmCount: films.length,
            foundTmdbIds: tmdbIds.length,
            expectedItemCount: expectedItemCount,
            workingSelector
          }
        });

      } catch (error) {
        allLists.push({
          listName: listItem.title,
          listUrl: `https://letterboxd.com${listItem.href}`,
          tmdbIds: [],
          metadata: {
            originalFilmCount: 0,
            foundTmdbIds: 0,
            expectedItemCount: null,
            error: 'Failed to process list'
          }
        });
      }
    }
    
    return { 
      lists: allLists,
      totalLists: allLists.length,
      summary: {
        totalTmdbIds: allLists.reduce((sum, list) => sum + list.tmdbIds.length, 0),
        totalExpectedItems: allLists.reduce((sum, list) => sum + (list.metadata.expectedItemCount || 0), 0)
      }
    };
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch Letterboxd lists'
    });
  }
});