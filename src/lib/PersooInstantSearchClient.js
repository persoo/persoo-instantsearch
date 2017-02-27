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

function createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount) {
    var receivedRequestCount = 0;
    var results = [];
    var isError = false;

    // FIXME pass eventNumber not to mix requests
    return function(persooEventProps, data){
        receivedRequestCount ++;
        results.push(translateResponse(data, persooEventProps));
         // TODO handle empty data
         // TODO expecting formattedResponse = a {query: undefined, parsedQuery: undefined, hits: undefined, index: undefined, hitsPerPage: undefined…},
         console.log('... Receiving data from Persoo: '+ JSON.stringify(data.items.length) + ' items.');
         if (receivedRequestCount >= requestsCount) {
             algoliaCallback(isError, {results: results});
         }
    }
}


export default class PersooInstantSearchClient {
    constructor(options) {
        this.options = options;

        return {
            addAlgoliaAgent: function(){},
            search: function(requests, algoliaCallback) {
                console.log('persooCustomClient.search(' + JSON.stringify(requests) + ')');

                // Algolia Client accepts batch requests, i.e. list of requests, one request is i.e.
                // [{"indexName":"YourIndexName","params":{"query":"a","hitsPerPage":20,"page":0,"facets":[],"tagFilters":""}}]
                var requestsCount = requests.length;
                var mergeCallback = createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount, persooProps)
                for (var i = 0; i < requestsCount; i++) {
                    var request = requests[i];
                    var params = request.params;
                    // var indexName = request.indexName;

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

                    console.log('... persoo.send('  + JSON.stringify(persooProps) + ')');
                    persoo('send', persooProps, mergeCallback.bind(this, persooProps) );
                }
            }
        }
    }
}
