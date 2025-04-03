import Trakt from "trakt.tv";
const traktKeys = useRuntimeConfig().trakt;

if (!traktKeys) {
  throw new Error("Missing TraktKeys info ERROR: " + JSON.stringify(traktKeys));
}

const options = {
  client_id: traktKeys.clientId,
  client_secret: traktKeys.clientSecret,
};

const trakt = new Trakt(options);
export default trakt;
