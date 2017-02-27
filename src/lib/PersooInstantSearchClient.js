import Cache from 'cache';
import {normalizeQuery, throttle, hashCode, DEBUG} from 'utils';

function translateResponse(data, persooEventProps) {
    function translateAggregationGroup(aggregationsGroup) {
        var map = {};
        for (var i = 0; i < aggregationsGroup.length; i++) {
            var aggItem = aggregationsGroup[i];
            map[aggItem.value] = aggItem.count; // note: values with '>' will not be displayed
        }
        return map;
    }
    var result =  {
        hits: data.items,
        hitsPerPage: data.pageSize,
        page: data.page,
        nbHits: data.totalHits,
        nbPages: data.pages,
        query: persooEventProps.query,
        index: persooEventProps.index,
        facets: {}
    };
    for (var group in data.aggregations) {
        if (persooEventProps.includeAggregations.indexOf(group) >= 0) {
            result.facets[group] = translateAggregationGroup(data.aggregations[group]);
        }
    }
    return result;
}

function createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount, cache) {
    var receivedRequestCount = 0;
    var results = [];
    var isError = false;

    // FIXME pass eventNumber not to mix requests
    return function(persooEventProps, queryHash, data){
        receivedRequestCount ++;
        cache.set(queryHash, data);

        var receivedData;
        if (data) {
            receivedData = translateResponse(data, persooEventProps)
        } else {
            receivedData = translateResponse({}, persooEventProps);
        }
        results.push(receivedData);

        DEBUG('... Receiving data from Persoo: '+ JSON.stringify(data.items.length) + ' items.');

        if (receivedRequestCount >= requestsCount) {
            algoliaCallback(isError, {results: results});
        }
    }
}


function preparePersooRequestProps(options, params) {
    var persooProps = {
        _e: "getRecommendation",
        _w: "getRecommendation",
        algorithmID: options.algorithmID,
        query: params.query,
        pageSize: params.hitsPerPage,
        page: params.page,
        index: "products",

        maxValuesPerFacet: params.maxValuesPerFacet,
        includeAggregations: params.facets || []
        // includeFields: []
    };
    // translate
    //     "facetFilters":[["key:value1", "key:value2"]]}
    // to
    //     persooProps[key]: ["value1", "value2"]
    var facetFilters = params.facetFilters || [];
    for (var j = 0; j < facetFilters.length; j++) {
        var facetFilter = facetFilters[j];
        for (var k = 0; k < facetFilter.length; k++) {
            var filterItem = facetFilters[j][k];
            var seperatorPos = filterItem.indexOf(':');
            var field = filterItem.substring(0, seperatorPos);
            var value = filterItem.substring(seperatorPos + 1);

            // join values with the same key to array
            if (persooProps[field]) {
                if (Array.isArray(persooProps[field])) {
                    persooProps[field].push(value);
                } else {
                    persooProps[field] = [persooProps[field], value];
                }
            } else {
                persooProps[field] = value;
            }
        }
    }

    return persooProps;
}

export default class PersooInstantSearchClient {
    constructor(options) {
        this.options = options;
        this.cache = new Cache();

        var cache = this.cache;
        return {
            addAlgoliaAgent: function(){},
            search: function(requests, algoliaCallback) {
                DEBUG('persooInstantSearchClient.search(' + JSON.stringify(requests) + ')');

                // Algolia Client accepts batch requests, i.e. list of requests, one request is i.e.
                // [{"indexName":"YourIndexName","params":{"query":"a","hitsPerPage":20,"page":0,"facets":[],"tagFilters":""}}]
                var requestsCount = requests.length;
                var mergeCallback = createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount, cache)
                for (var i = 0; i < requestsCount; i++) {
                    var request = requests[i];
                    var params = request.params;
                    // var indexName = request.indexName;

                    var persooProps = preparePersooRequestProps(options, params);
                    var queryHash = hashCode(JSON.stringify(persooProps));
                    DEBUG('... persoo.send('  + JSON.stringify(persooProps) + ')');

                    var cachedResponse = cache.get(queryHash);
                    if (cachedResponse) {
                        DEBUG('... Serving data from cache: '+ JSON.stringify(cachedResponse.items.length) + ' items.');
                        mergeCallback(persooProps, queryHash, cachedResponse);
                    } else {
                        persoo('send', persooProps, mergeCallback.bind(this, persooProps, queryHash) );
                    }
                }
            }

        }
    }
}
