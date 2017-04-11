import React from 'react';
import ReactDOM from 'react-dom';
import { h, render } from 'preact';

import {convertToReactComponent} from 'utils';

// See more details in our documentation:
// https://community.algolia.com/instantsearch.js/documentation/#custom-widgets

function header({container, templates}) {
    const Header = convertToReactComponent(templates.root || "");
    let containerNode = null;

    return {
        init() {
            containerNode = document.querySelector(container);
        },
        render({results /*, helper, state */}) {
            if (containerNode) {
                ReactDOM.render(
                    <Header
                        className='persoo-header persoo-header__root'
                        nbHits={results.nbHits}
                        nbPages={results.nbPages}
                        page={results.page}
                        query={results.query}
                    />,
                    containerNode
                );
            }
        }
    }
}

export default header;
