# Persoo instantsearch.js connector

Persoo client which can be used inside instantsearch.js widget.

Try online [Demo] and play with it.



## Development Workflow

Or checkout this repository and modify it as you want to.

**4. Start a live-reload development server:**

```sh
npm run dev
```

> This is a full web server nicely suited to your project. Any time you make changes within the `src` directory, it will rebuild and even refresh your browser.

**5. Testing with `mocha`, `karma`, `chai`, `sinon` via `phantomjs`:**

```sh
npm test
```

**6. Generate a production build in `./build`:**

```sh
npm run build
```

The output is in the /build directory.

**5. Start local production server with `superstatic`:**

```sh
npm start
```

> This is to simulate a production (CDN) server with gzip. It just serves up the contents of `./build`.



## License

MIT

Using libraries:
*  instantsearch.js 1.11.1 | © Algolia Inc. and other contributors; Licensed MIT | github.com/algolia/instantsearch.js

[Demo]: <https://rawgit.com/persoo/persoo-instantsearch/master/demo/index.html>
[persooInstantSearch.js]: <./dist/persooInstantSearch.js>
[BEM naming standarts]: <http://getbem.com/naming/>
