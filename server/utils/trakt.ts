import Trakt from 'trakt.tv';
const traktKeys = useRuntimeConfig().trakt

const options = {
  client_id: traktKeys.clientId,
  client_secret: traktKeys.clinetSecret
}

const trakt = new Trakt(options);
export default trakt;