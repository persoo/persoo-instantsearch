require('offline-plugin/runtime').install();

import instantsearch from 'instantsearch.js';
// import { h, render } from 'preact';

import PersooInstantSearchClient from 'PersooInstantSearchClient';

function createInstantSearchConnector(options) {
        const searchClient = new PersooInstantSearchClient(options);

        return instantsearch({
            appId: 'noAppID',
            apiKey: 'noAPIKey',
            indexName: 'persoo',
            createAlgoliaClient: function(algoliasearch, appId, apiKey) { return searchClient; },
            urlSync: options.urlSync || false
        });
}

window.persooInstantSearch = createInstantSearchConnector;
window.persooInstantSearch.widgets = instantsearch.widgets;

if (module.hot) {
    module.hot.accept('./lib/PersooInstantSearchClient', () => requestAnimationFrame(init) );
}
