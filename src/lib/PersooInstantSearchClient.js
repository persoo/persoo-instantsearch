import Cache from 'cache';
import {normalizeQuery, hashCode, throttle} from 'utils';

// const DEBUG = true;

/**
    How alolia instantsearch works:
    https://github.com/algolia/algoliasearch-helper-js/blob/develop/src/algoliasearch.helper.js
    helper.search() only builds search query from state and calls client.search(queries, dispatchCallback)

    dispatchCallback([states, queryID], error, content)
        first 2 params are bound so client.search() do not see them
        if (error) do nothing
        if (queryID received is too old, then throw it away and do nothing
        else process content ... call 'results' event causing render()

    Thus we do:
        if there are too many request in the queue, then skip them (do nothing).
        but make sure that results for final query will arrive, otherwise no render() is called.

    TODO funther improvements: remember 'searching' status. In case server did not respond yet, do not trigger
         search query and postpone it. (but have some max timelimit)
*/


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
        hitsPerPage: data.itemsPerPage,
        page: data.page,
        nbHits: data.itemsCount,
        nbPages: data.pagesCount,
        query: persooEventProps.query,
        index: persooEventProps.index,
        facets: {},
        facets_stats: {}
    };
    if (data.aggregations) {
        for (var group in data.aggregations) {
            if (persooEventProps.aggregations.indexOf(group) >= 0) {
                var groupData = data.aggregations[group];
                if (groupData.numeric) {
                    result.facets_stats[group] = groupData.numeric;
                    var avg = groupData.numeric.avg || 0;
                    result.facets[group] = {};
                    result.facets[group][avg] = 1;
                    // result.facets[group] = {"123": 123}; // algolia requires facet, too. So proivide value which nobody uses.
                }
                if (groupData.terms || !groupData.numeric) {
                    result.facets[group] = translateAggregationGroup(groupData.terms);
                }
            }
        }
    }
    return result;
}

function parseExternalRequestID(str) {
    var parts = str.split('_');
    return {
        number: parseInt(parts[0]),
        pos: parseInt(parts[1]),
    }
}

function createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount, cache) {
    var receivedRequestCount = 0;
    var results = [];
    var isError = false;

    return function(persooEventProps, queryHash, data){
        receivedRequestCount ++;
        cache.set(queryHash, data);

        if (typeof data.itemsCount == 'undefined' || typeof data.externalRequestID == 'undefined') {
            isError = true;
            console.log("Persoo server response: does not contain requiered data. Do you call existing algorithmID?");
        } else {
            var externalRequestID = parseExternalRequestID(persooEventProps.externalRequestID);
            var receivedExternalRequestID = parseExternalRequestID(data.externalRequestID);

            if (externalRequestID.number == receivedExternalRequestID.number) {
                var receivedData;
                if (data) {
                    receivedData = translateResponse(data, persooEventProps)
                } else {
                    receivedData = translateResponse({}, persooEventProps);
                }
                results[receivedExternalRequestID.pos] = receivedData;

                if (DEBUG) { console.log('... Receiving data ' + data.externalRequestID + ' from Persoo: ' +
                            data.items.length + ' items.');
                }
                if  (externalRequestID.pos != receivedExternalRequestID.pos) {
                    console.error(' Requested part ' + externalRequestID.pos + ' but received part ' +
                            receivedExternalRequestID.pos + '!');
                }
            } else if (externalRequestID.number > receivedExternalRequestID.number) {
                if (DEBUG) { console.log('... Receiving and ignoring old data ' + data.externalRequestID +
                        ' from Persoo.');
                }
            } else {
                if (DEBUG) { console.log('... Ops, receiving future data ' + data.externalRequestID +
                        ' from Persoo.');
                }
            }
        }
        if (receivedRequestCount >= requestsCount) {
            algoliaCallback(isError, {results: results});
        }
    }
}

function addCustomRuleToQuery(query,field, operator, value) {
    if (query && query.must) {
        query.must.push({
            type: "customRule",
            fields: [field, operator, "value", JSON.stringify(value)]
        });
        // TODO: change it to new ProductSearch format
    }
}

function preparePersooRequestProps(options, params, indexWithSort) {
    var persooProps = {
        _e: "getRecommendation",
        algorithmID: options.algorithmID,
        query: params.query,
        itemsPerPage: params.hitsPerPage,
        page: params.page,
        index: indexWithSort.replace(/_.*$/, ''),

        maxValuesPerFacet: params.maxValuesPerFacet,
        aggregations: (Array.isArray(params.facets) ? params.facets : ((params.facets && [params.facets])  || []))
        // includeFields: []
        // boolQuery: {}
    };
    var boolQuery = {must:[]};
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
        addCustomRuleToQuery(boolQuery,field, '$in', persooProps[field]);
    }
    // translate
    //    "numericFilters":["price<=1548"]}
    // to
    //    persooProps["price_lte"]: 1548
    var numericFilters = params.numericFilters || [];
    for (var i = 0; i < numericFilters.length; i++) {
        var num_parts = numericFilters[i].split(/\b/);
        var num_field = num_parts[0];
        var num_operator = num_parts[1];
        var num_value = parseFloat(num_parts[2]);
        var convertOp = {
            '>': 'gt',
            '<': 'lt',
            '>=': 'gte',
            '<=': 'lte'
        };
        persooProps[num_field + '_' + convertOp[num_operator]] = num_value;
        addCustomRuleToQuery(boolQuery, field, '$' + convertOp[num_operator], num_value);
    }

    if (boolQuery.must.length > 0) {
        persooProps.boolQuery = boolQuery;
    }

    // Get Sort options if any
    var indexParts = indexWithSort.split('_');
    if (indexParts.length > 2) {
        var sortField = indexParts[indexParts.length - 2];
        var sortOrder = indexParts[indexParts.length - 1];
        persooProps.sortByField = sortField;
        persooProps.sortOrder = sortOrder.toLowerCase();
    }

    return persooProps;
}

export default class PersooInstantSearchClient {
    constructor(options) {
        this.options = options;
        this.options.requestThrottlingInMs = this.options.requestThrottlingInMs || 200;
        this.cache = new Cache();
        this.statistics = {
            batchRequestCount: 0
        }

        var cache = this.cache;
        var statistics = this.statistics;

        function searchFunction(requests, algoliaCallback) {
            if (DEBUG) { console.log('persooInstantSearchClient.search(' + JSON.stringify(requests) + ')'); }

            statistics.batchRequestCount++;

            // Algolia Client accepts batch requests, i.e. list of requests, one request is i.e.
            // [{"indexName":"YourIndexName","params":{"query":"a","hitsPerPage":20,"page":0,"facets":[],"tagFilters":""}}]

            // Note: send requests to Persoo in opposite order, so the primary requests is the last because of algorithm
            // debugging in Persoo. (widget waits for all requests before rerendering, so it does not matter)
            var requestsCount = requests.length;
            var mergeCallback = createMergePersooResponsesToBatchCallback(algoliaCallback, requestsCount, cache)
            for (var i = requestsCount - 1; i >= 0; i--) {
                var request = requests[i];
                var params = request.params;
                var indexWithSort = request.indexName;

                var persooProps = preparePersooRequestProps(options, params, indexWithSort);
                var queryHash = hashCode(JSON.stringify(persooProps)); // without requestID
                var externalRequestID = statistics.batchRequestCount + '_' + i;
                persooProps.externalRequestID = externalRequestID;

                if (DEBUG) { console.log('... persoo.send('  + JSON.stringify(persooProps) + ')'); }

                var cachedResponse = cache.get(queryHash);
                if (cachedResponse) {
                    if (DEBUG) { console.log('... Serving data from cache: ' +
                        JSON.stringify(cachedResponse.items.length) + ' items.');
                    }
                    cachedResponse.externalRequestID = externalRequestID;
                    mergeCallback(persooProps, queryHash, cachedResponse);
                } else {
                    persoo('send', persooProps, mergeCallback.bind(this, persooProps, queryHash) );
                    // empty 'data' in mergeCallback are interpretted as error
                    persoo('onError', mergeCallback.bind(this, persooProps, queryHash, {}));
                }
            }
        }

        // throttle requests for people who type extremly fast
        var searchFunctionThrottled = throttle(searchFunction, this.options.requestThrottlingInMs, false);

        return {
            addAlgoliaAgent: function(){},
            search: searchFunctionThrottled
        }
    }
}
