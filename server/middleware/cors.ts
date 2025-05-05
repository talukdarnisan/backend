export default defineEventHandler(event => {
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,PUT,PATCH,POST,DELETE',
    'Access-Control-Allow-Headers': '*',
  });

  if (event.method === 'OPTIONS') {
    event.node.res.statusCode = 204;
    return '';
  }
});
