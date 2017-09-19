require('offline-plugin/runtime').install();

// import { h, render } from 'preact';
import 'es6-symbol/implement';
import instantsearch from 'instantsearch.js';
import {getRenderFunction, throttle} from 'utils';

import objectAssignPolyfill from 'objectAssignPolyfill';
import PersooInstantSearchClient from 'PersooInstantSearchClient';
import HeaderWidget from './widgets/header';

function createInstantSearchConnector(options) {
        const searchClient = new PersooInstantSearchClient(options);
        let callbacks = {};
        let instantSearchOptions = {
            appId: 'noAppID',
            apiKey: 'noAPIKey',
            indexName: options.indexName || 'products',
            createAlgoliaClient: function(algoliasearch, appId, apiKey) { return searchClient; },
            urlSync: options.urlSync || false
        };
        if (options.hideOnEmptyQuery) {
            instantSearchOptions.searchFunction = function(helper) {
                const isEmptyQuery = (helper.getStateAsQueryString() == 'q=');
                if (isEmptyQuery) {
                      callbacks.hide && callbacks.hide();
                      /* Note: call search() even if hidden to update url params a input box query */
                }
                helper.search();
                callbacks.show && callbacks.show();
            };
        }

        let instantSearchInstance = instantsearch(instantSearchOptions);
        instantSearchInstance.setPersooCallback = function(name, func) {
            callbacks[name] = func;
        }
        return instantSearchInstance;
}

window.persooInstantSearch = createInstantSearchConnector;
window.persooInstantSearch.EJS = getRenderFunction;
window.persooInstantSearch.throttle = throttle;

// custom persoo widgets
window.persooInstantSearch.widgets = instantsearch.widgets;
instantsearch.widgets.header = HeaderWidget;

// add all necessary polyfills
objectAssignPolyfill();

if (module.hot) {
    module.hot.accept('./lib/PersooInstantSearchClient', () => requestAnimationFrame(init) );
}
