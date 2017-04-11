require('offline-plugin/runtime').install();

// import { h, render } from 'preact';
import instantsearch from 'instantsearch.js';
import {getRenderFunction} from 'utils';

import PersooInstantSearchClient from 'PersooInstantSearchClient';
import HeaderWidget from './widgets/header';

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
window.persooInstantSearch.EJS = getRenderFunction;

// custom persoo widgets
window.persooInstantSearch.widgets = instantsearch.widgets;
instantsearch.widgets.header = HeaderWidget;

if (module.hot) {
    module.hot.accept('./lib/PersooInstantSearchClient', () => requestAnimationFrame(init) );
}
