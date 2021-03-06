function getSettings() {
  return {
    DATABASE_NAME: "lnotes",
    DATABASE_VERSION: 24,
    SMART_REM_PREFIX: ">>>",
    SMART_VIEW_REM_ID: "SOMETHING", // Rem tagged with this Rem are considered as Smart Views
  };
}

// =============== Query explorations ================
function remContent(rem) {
  return [...rem.key, ...(rem.value || [])];
}

async function getRemText(remId, exploredRem = []) {
  let rem = await db.get("quanta", remId);
  if (!rem) return;

  const richTextElementsText = await Promise.all(
    rem.key.map(async (richTextElement) => {
      // If the element is a string, juts return it
      if (typeof richTextElement == "string") {
        return richTextElement;
        // If the element is a Rem Reference (i == "q"), then recursively get that Rem Reference's text.
      } else if (
        richTextElement.i == "q" &&
        !exploredRem.includes(richTextElement._id)
      ) {
        return await getRemText(
          richTextElement._id,
          exploredRem.concat([richTextElement._id])
        );
      } else {
        // If the Rem is some other rich text element, just take its .text property.
        return richTextElement.text;
      }
    })
  );
  return richTextElementsText.join("");
}

async function makeRemContainer(rem) {
  //const template = document.createElement("template");
  //template.innerHTML = `<div class="sr-rem-container">${await getRemText(rem._id)}</div>`;
  //return template.content.firstChild;
  const text = await getRemText(rem._id);
  return `<div class="sr-rem-container">${text}</div>`;
}

function hasReference(rem, refId) {
  for (let part of remContent(rem)) {
    if (typeof part === "object" && part.i === "q" && part._id === refId) {
      return true;
    }
  }
  return false;
}

function hasTag(rem, tagId) {
  /* TODO: Not implemented */
}

/**
 * returns query AST as a json object representing the postorder
 */
async function parseQuery(rawExpression) {
  // TODO: I can be even more explicit with hasReference, hasTag and maybe date operators.
  // This would play more nicely with not
  const resolvedReferences = await Promise.all(
    rawExpression.map(async (part) => {
      if (typeof part === "string") {
        return part;
      }
      if (typeof part === "object" && part.i === "q") {
        return `"${part._id}"`;
      }
      return "??";
    })
  );

  const queryStr = resolvedReferences.join("");
  console.info("Query STR", queryStr);
  const query = JSON.parse(queryStr);
  console.info("Query AST", query);
  return query;
}

async function resolveQuery(queryAST) {
  if (queryAST.and) {
    const remIds = queryAST.and;
    console.info("and", remIds);
    const result = [];
    let cursor = await db.transaction("quanta").store.openCursor();

    // There is an async iterator version which might make this more responsive
    // for await (const cursor of tx.store) {
    //   const rem = cursor.value;
    //   if (remIds.every(remId => hasReference(rem, remId))) {
    //     result.push(rem)
    //   }
    // }
    while (cursor) {
      const rem = cursor.value;
      if (remIds.every((remId) => hasReference(rem, remId))) {
        result.push(rem);
      }
      cursor = await cursor.continue();
    }
    console.warn("query result", result);
    return result;
  } else if (queryAST.or) {
    const remIds = queryAST.or;
    console.info("or", remIds);
    const result = [];
    let cursor = await db.transaction("quanta").store.openCursor();
    while (cursor) {
      const rem = cursor.value;
      if (remIds.some((remId) => hasReference(rem, remId))) {
        result.push(rem);
      }
      cursor = await cursor.continue();
    }
    console.warn("query result", result);
    return result;
  } else if (false && queryAST.not) {
    const remIds = queryAST.not;

    console.info("or", remIds);
    const result = [];
    let cursor = await db.transaction("quanta").store.openCursor();
    while (cursor) {
      const rem = cursor.value;
      if (remIds.some((remId) => hasReference(rem, remId))) {
        result.push(rem);
      }
      cursor = await cursor.continue();
    }
    console.warn("query result", result);
    return result;
  }
  return [];
}

// ============= Common functions ==========

function getRemMarkdown(remid) {
  // TODO: implement
  return getRemText(remId);
}

async function getRemText(remId, exploredRem = []) {
  let rem = await db.get("quanta", remId);
  if (!rem) return;

  const richTextElementsText = await Promise.all(
    rem.key.map(async (richTextElement) => {
      // If the element is a string, juts return it
      if (typeof richTextElement == "string") {
        return richTextElement;
        // If the element is a Rem Reference (i == "q"), then recursively get that Rem Reference's text.
      } else if (
        richTextElement.i == "q" &&
        !exploredRem.includes(richTextElement._id)
      ) {
        return await getRemText(
          richTextElement._id,
          exploredRem.concat([richTextElement._id])
        );
      } else {
        // If the Rem is some other rich text element, just take its .text property.
        return richTextElement.text;
      }
    })
  );
  return richTextElementsText.join("");
}

async function getRemHTML(remId, exploredRem = []) {
  let rem = await db.get("quanta", remId);
  if (!rem) return;
  const richTextElementsHTML = await Promise.all(
    rem.key.map(async (richTextElement) => {
      // If the element is a string, juts return it
      if (typeof richTextElement == "string") {
        return richTextElement;
        // If the element is a Rem Reference (i == "q"), then recursively get that Rem Reference's text.
      } else if (richTextElement.i == "q") {
        return await getRemText(richTextElement._id);
      } else if (richTextElement.i == "m") {
        // TODO: There is much missing here: images, code blocks, latex
        let html = richTextElement.text;
        if (richTextElement.b) {
          html = `<strong>${html}</strong>`;
        }
        if (richTextElement.l) {
          html = `<em>${html}</em>`;
        }
        return html;
      } else {
        return richTextElement.text;
      }
    })
  );
  return richTextElementsHTML.join("");
}

// ============= Smart Rem =================

// ---------- Smart Rem Util ---------------

// Return promises for each dependency
// Check if link elements also have an onload event
function addDependency(url) {
  if (url.endsWith(".css")) {
    return addCSSDependency(url);
  } else if (url.endsWith(".js")) {
    return addJsDependency(url);
  } else {
    // TODO: do error handling here
    return new Promise((_, reject) => {
      console.error("Could not load dependency", url);
      reject(url);
    });
  }
}

function addCSSDependency(url) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = url;
    document.getElementsByTagName("head")[0].appendChild(link);
    // For now I do not wait on loading them since it is not that
    // important for CSS to arive first.
    resolve();
  });
}

function addJsDependency(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.addEventListener("load", resolve);
    script.addEventListener("error", (e) => reject(e.error));
    document.getElementsByTagName("head")[0].appendChild(script);
  });

  // https://stackoverflow.com/questions/8578617/inject-a-script-tag-with-remote-src-and-wait-for-it-to-execute
  // (function(d, s, id){
  //     var js, fjs = d.getElementsByTagName(s)[0];
  //     if (d.getElementById(id)){ return; }
  //     js = d.createElement(s); js.id = id;
  //     js.onload = function(){
  //         // remote script has loaded
  //     };
  //     js.src = "//connect.facebook.net/en_US/sdk.js";
  //     fjs.parentNode.insertBefore(js, fjs);
  // }(document, 'script', 'facebook-jssdk'));
}

// ------- Smart Rem Definitions -----------

async function f() {
  const settings = getSettings();
  const REM_ID_LENGTH = 17;
  const SMART_REM_PREFIX = settings.SMART_REM_PREFIX;

  function matchRegex(regex) {
    return (el) => {
      const smartCommandText = el.remData.key[0]
        .slice(SMART_REM_PREFIX.length)
        .trim();
      return regex.exec(smartCommandText);
    };
  }

  let enabledSmartCommands = [
    {
      // TODO: Listen to changes of child rems
      // TODO: Can an API be used to allow screenshots?
      matcher: matchRegex(/^\s*github-issue/),
      handler: async (match, el) => {
        // user/repo
        // title
        // content
        // content

        // Adapted from https://github.com/sindresorhus/new-github-issue-url
        function createIssueURL(userRepo, title, body) {
          const repoUrl = `https://github.com/${userRepo}`;

          const url = new URL(`${repoUrl}/issues/new`);

          const params = [
            "body",
            "title",
            "labels",
            "template",
            "milestone",
            "assignee",
            "projects",
          ];

          url.searchParams.set("title", title);
          url.searchParams.set("body", body);

          return url.toString();
        }

        const children = await Promise.all(
          el.remData.children.map(async (childId) => await getRemText(childId))
        );

        if (children.length < 3) {
          return `<p>Specify at least user/repo, title and content as children of this rem.</p>`;
        }
        const [userRepo, title, ...body] = children;
        console.info(body);
        const url = createIssueURL(
          userRepo.trim(),
          title.trim(),
          body.join("\n")
        );

        // TODO: Fragments should be applied with tags
        return `<p>Report issue for github.com/${userRepo}: <a href="${url}" target="_blank"><button>Create Issue</button></a></p>`;
      },
    },
  ];

  // TODO: Each smart rem should also get a `name` which is added as class to the result node.
  const allSmartCommands = [
    {
      matcher: matchRegex(/^\s*query-rem-json:(.*)/),
      handler: async (match, el) => {
        const rawExpression = [...el.remData.key];
        rawExpression[0] = match[1];
        const query = await parseQuery(rawExpression);
        const resultIncludingSelf = await resolveQuery(query);
        const result = resultIncludingSelf.filter(
          (rem) => rem._id !== el.remData._id
        );
        const remContainers = await Promise.all(result.map(makeRemContainer));

        return `<p>${remContainers.join("\n")}</p>`;
      },
    },
    {
      matcher: matchRegex(/^=(.*)/),
      handler: async (match, el) => {
        const rawExpression = [...el.remData.key];
        rawExpression[0] = match[1];
        const resolvedVariables = await Promise.all(
          rawExpression.map(async (part) => {
            if (typeof part === "string") {
              return part;
            }
            if (typeof part === "object" && part.i === "q") {
              const rem = await db.get("quanta", part._id);
              return rem.value;
            }
            return "??";
          })
        );

        const expression = resolvedVariables.join("");
        const result = eval(expression);

        console.info("Calc: ", match, " = ", result);
        return `<p>${expression} = ${result}</p>`;
      },
    },
    {
      matcher: matchRegex(/^spotify:\s*(.+)/),
      handler: async (match) =>
        `<iframe src="https://open.spotify.com/embed/${match[1]}" width="300" height="380"></iframe>`,
    },
    {
      matcher: matchRegex(/^embed:\s*(.+)/),
      handler: async (match) =>
        `<iframe src="https://${match[1]}" width="750" height="500"></iframe>`,
    },
    {
      // More embeds than simple tweets are possible, like showing the timeline of someone
      // https://developer.twitter.com/en/docs/twitter-for-websites/javascript-api/guides/scripting-factory-functions
      init: function () {
        window.twttr = (function (d, s, id) {
          var js,
            fjs = d.getElementsByTagName(s)[0],
            t = window.twttr || {};
          if (d.getElementById(id)) return t;
          js = d.createElement(s);
          js.id = id;
          js.src = "https://platform.twitter.com/widgets.js";
          fjs.parentNode.insertBefore(js, fjs);

          t._e = [];
          t.ready = function (f) {
            t._e.push(f);
          };
          console.info("initialized twitter");

          return t;
        })(document, "script", "twitter-wjs");
      },
      matcher: matchRegex(/^twitter:\s*(.+)/),
      handler: async (match) => {
        console.info("rendering twitter");
        twttr.widgets
          .createTweet(
            "511181794914627584",
            document.getElementById("twitter-tweet"),
            {
              align: "left",
            }
          )
          .then(function (el) {
            console.info("Tweet displayed.");
          })
          .catch(console.error);
      },
    },
    {
      matcher: matchRegex(/^weather:\s*(.+)/),
      handler: async (match) =>
        `<img src="https://wttr.in/${match[1]}_tpq0.png" />`,
      /* handler: async match => {
        const resp = await fetch("https://wttr.in/Dresden");
        const text = await resp.text();
        console.warn(text);
        return `${text}`;
    }*/
    },
    {
      dependencies: [
        "https://cdn.jsdelivr.net/npm/reveal.js/dist/reveal.js",
        "https://cdn.jsdelivr.net/npm/reveal.js/dist/reveal.css",
        "https://cdn.jsdelivr.net/npm/reveal.js/dist/theme/white.css",
        //"https://cdnjs.cloudflare.com/ajax/libs/highlight.js/9.13.1/styles/zenburn.min.css",
      ],
      matcher: matchRegex(/^presentation/),
      handler: async (match, el) => {
        const remId = el.remData._id;
        const presentationId = `deck-${remId}`;

        async function buildSlide(slideRemId) {
          const slideRem = await db.get("quanta", slideRemId);
          const bulletPoints = await Promise.all(
            slideRem.children.map(async (childId) => await getRemHTML(childId))
          );
          // TODO: Animation Fragments should be configurable with tags
          return `<h2>${await getRemText(
            slideRemId
          )}</h2><ul>${bulletPoints
            .map((p) => `<li class="fragment">${p}</li>`)
            .join("")}</ul>`;
        }

        async function buildPresentationContent(rootRem) {
          console.info(rootRem.children);
          const slides = await Promise.all(
            rootRem.children.map(async (childId) => await buildSlide(childId))
          );
          console.info("slides", slides);
          return `<div class="slides">${slides
            .map((slide) => `<section>${slide}</section>`)
            .join("\n")}</div>`;
        }

        const presentationTemplate = document.createElement("template");
        presentationTemplate.innerHTML = `<div class="reveal">
      ${await buildPresentationContent(el.remData)}
    </div>`;
        const presentation = presentationTemplate.content.firstChild;
        presentation.id = presentationId;
        window.presentation = presentation;
        const deck = new Reveal(presentation, {
          embedded: true,
          keyboardCondition: "focused",
        });
        deck.initialize();
        return presentation;
      },
    },
    {
      dependencies: [
        "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js",
      ],
      init: function () {
        mermaid.initialize({
          securityLevel: "loose",
        });
      },
      matcher: matchRegex(/^mermaid/),
      handler: async (match, el) => {
        const codeBlocks = el.remData.key.filter(
          (part) => part.i && part.i === "o"
        );
        if (codeBlocks.length < 1) {
          return `<p>No code block found!</p>`;
        }

        const graphDefinition = codeBlocks[0].text;
        const mermaidId = `mermaid-${el.remData._id}`;
        const mermaidNode =
          document.getElementById(mermaidId) || document.createElement("div");
        console.info(mermaidNode);
        mermaidNode.id = mermaidId;

        function insertSvg(svgCode, bindFunctions) {
          mermaidNode.innerHTML = svgCode;
        }
        mermaid.render(mermaidId + "-graph", graphDefinition, insertSvg);
        return mermaidNode;
      },
    },
    {
      dependencies: [
        "https://d3js.org/d3.v3.min.js",
        "https://cdn.jsdelivr.net/cal-heatmap/3.3.10/cal-heatmap.js",
        "https://cdn.jsdelivr.net/cal-heatmap/3.3.10/cal-heatmap.css",
      ],
      init: function () {
        mermaid.initialize({
          securityLevel: "loose",
        });
      },
      matcher: matchRegex(/^heatmap/),
      handler: async (match, el) => {
        const cards = await db.getAll("cards");
        let practice_sessions = {};
        for (let card of cards) {
          if (!card.h) continue;
          for (let hi of card.h) {
            let t = typeof hi.date === "number" ? hi.date : Date.parse(hi.date);
            t /= 1000;
            practice_sessions[t] = practice_sessions[t]
              ? practice_sessions[t] + 1
              : 1;
          }
        }
        const heatmapNode = document.createElement("div");
        heatmapNode.className = "heatmap";
        const today = new Date();
        let start = new Date();
        start.setMonth(start.getMonth() - 11);
        start.setDate(1);
        const cal = new CalHeatMap();
        cal.init({
          // itemSelector: '#' + targetContainerId,
          itemSelector: heatmapNode,
          domain: "month",
          subDomain: "day",
          data: practice_sessions,
          start: start,
          cellSize: 10,
          range: 12,
          legend: [20, 40, 60, 80],
          legendVerticalPosition: "center",
          legendHorizontalPosition: "right",
          legendOrientation: "vertical",
          tooltip: true,
          highlight: ["now", today],
        });
        return heatmapNode;
      },
    },
    {
      matcher: matchRegex(/^chucknorris/),
      handler: async (match) => {
        const resp = await fetch("https://api.chucknorris.io/jokes/random");
        const json = await resp.json();
        return `<p>🧔 ${json.value}</p>`;
      },
    },
    // TODO: Dependency injection like this does not work. Use `dependencies` key for this.
    //     {
    //       matcher: matchRegex(/^weatherwidget/),
    //       handler: async (match) => {
    //         return `<a class="weatherwidget-io" href="https://forecast7.com/de/51d0513d74/dresden/" data-label_1="DRESDEN" data-label_2="Wetter" data-font="Fira Sans" data-icons="Climacons Animated" data-mode="Forecast" data-days="5" data-theme="dark" >DRESDEN Wetter</a>
    // <script>
    // !function(d,s,id){var js,fjs=d.getElementsByTagName(s)[0];if(!d.getElementById(id)){js=d.createElement(s);js.id=id;js.src='https://weatherwidget.io/js/widget.min.js';fjs.parentNode.insertBefore(js,fjs);}}(document,'script','weatherwidget-io-js');
    // </script>`;
    //       },
    //     },
    {
      matcher: matchRegex(/^current ip/),
      handler: async (match) => {
        const resp = await fetch("https://api.ipify.org/?format=json");
        const json = await resp.json();
        return `<p>💻 ${json.ip}</p>`;
      },
    },
    {
      matcher: matchRegex(/^zip code:\s*(.+)/),
      handler: async (match) => {
        const resp = await fetch(`https://api.zippopotam.us/${match[1]}`);
        const json = await resp.json();
        if (!json.places) {
          return `<p>Not found!</p>`;
        }
        return `<p>${json.places[0]["place name"]}, ${json.country}</p>`;
      },
    },
    {
      matcher: matchRegex(/^xkcd/),
      handler: async (match) => {
        const resp = await fetch("https://xkcd.now.sh/?comic=latest");
        const json = await resp.json();
        return `<img src="${json.img}" />`;
      },
    },
    {
      matcher: matchRegex(/^html:\s*(.+)/),
      handler: async (match) => {
        return `${match[1]}`;
      },
    },
    {
      dependencies: [
        "https://cdnjs.cloudflare.com/ajax/libs/showdown/1.9.1/showdown.min.js",
      ],
      matcher: matchRegex(/^markdown:\s*(.+)/s),
      handler: async (match) => {
        const markdown = match[1];
        console.warn("markdown", markdown);
        const html = new showdown.Converter({ tables: true }).makeHtml(
          markdown
        );
        return html;
      },
    },
    {
      matcher: matchRegex(/^regex matching the smart command/),
      handler:
        "async function taking the smart block content and returning result markup",
    },
  ];

  function findAllRem() {
    return [...document.querySelectorAll("[id^=Pane][id$=REM]")];
  }

  function remId(remEl) {
    return remEl.id.slice(
      remEl.id.length - 3 - REM_ID_LENGTH,
      remEl.id.length - 3
    );
  }

  function isSmartRem(el) {
    // TODO: This works only for plain text, not bold formatting etc.
    const rem = el.remData;
    return (
      rem &&
      rem.key.length &&
      rem.key[0].startsWith &&
      rem.key[0].startsWith(">>>")
    );
  }

  async function updateRemData(el) {
    el.remData = await db.get("quanta", remId(el));
  }

  // Life Cycle Polyfill
  // Rem is created
  function onCreate(el) {
    console.info("onCreate", el.id);
  }

  // The rem is discovered, e.g. after reloading the page or navigating
  async function onInsert(el) {
    await updateRemData(el);

    if (isSmartRem(el)) {
      prepareSmartRem(el);
      await evaluateSmartRem(el);
    }
  }

  // Rem is deleted
  function onDelete(el) {
    // For this I need to store a set of references to elements and check if the an element of the new collection was already present
    // I don't need this yet, so I will not other.
    console.info("onDelete", el.id);
  }

  // Rem is focused for editing
  function onFocusIn(event) {
    console.info("onFocusIn", event);
  }

  // Rem is unfocused
  async function onFocusOut(el) {
    await updateRemData(el);
    console.info("onFocusOut", el, el.remData, el.remSmartResult);
    if (isSmartRem(el)) {
      await evaluateSmartRem(el);
    } else {
      if (el.remSmartResult) {
        el.remSmartResult.remove();
        delete el.remSmartResult;
      }
    }
  }

  // Rem content changed
  function onChange(el) {
    // I assume this can only happen if a rem is focused for now (no plugin etc.)
    // Here I need to check periodically if the new content is the old content
    // For that the old and new content has to be compared
    // I will moch this for now as running periodically.
    console.info("onChange", el.id);
  }

  function prepareSmartRem(el) {
    // add evaluate button
    // add result container
    // add events to watch or recalculate rem
    // TODO: These hooks should be provided by the API
    setResult(el, "?");
  }

  // This function is run periodically on all rem.
  async function prepareLifeCycle(el) {
    if (el.remLifeCycleHooks !== undefined) {
      // Old rem: hooks already installed
      return;
    }
    el.remLifeCycleHooks = {};
    await onInsert(el);

    // TODO: Focus in should run change handler
    el.remLifeCycleHooks.focusin = (event) => onFocusIn(el, event);
    el.addEventListener("focusin", el.remLifeCycleHooks.focusin);
    el.remLifeCycleHooks.focusout = (event) => onFocusOut(el, event);
    el.addEventListener("focusout", el.remLifeCycleHooks.focusout);
    // TODO: Change handler or focusOut should check if it is a smartRem or not

    // TODO: Monitor new rems or when a rem is turned into a smart rem
  }

  function setResult(el, resultMarkup) {
    if (el.remSmartResult) {
      el.remSmartResult.remove();
      delete el.remSmartResult;
    }
    const result = makeResult(resultMarkup);
    el.remSmartResult = result;
    el.append(result);
  }

  function makeResult(resultMarkup) {
    const smartRemResult = document.createElement("div");
    smartRemResult.classList.add("smart-rem-result");
    // TODO: Add custom result classes here, e.g. to float right.
    // TODO: Maybe I should bundle <styles> with the smart rems as well. (Research CSS modules)

    if (typeof resultMarkup === "string") {
      const resultTemplate = document.createElement("template");
      resultTemplate.innerHTML = resultMarkup;
      smartRemResult.append(...resultTemplate.content.children);
    } else {
      // HTMLNode
      smartRemResult.appendChild(resultMarkup);
    }

    return smartRemResult;
  }

  async function evaluateSmartRem(el) {
    for (const smartCommand of enabledSmartCommands) {
      const match = smartCommand.matcher(el);
      if (match) {
        const result = await smartCommand.handler(match, el);
        setResult(el, result);
        return;
      }
    }
    setResult(el, "? Command not found!");
  }

  // Comment this when developing smart rem and remove after there are options which smart rems to enable
  // This makes it faster to load since not as many dependencies have to be downloaded
  //
  enabledSmartCommands = [...enabledSmartCommands, ...allSmartCommands];

  // TODO: Prevent reloading the dependencies when rerunning the script.
  // E.g. generate a unique id for each script url and check if it is already there.
  const dependencies = Array.prototype.concat(
    ...enabledSmartCommands.map((sr) => sr.dependencies).filter((d) => d)
  );
  console.info("Loading dependencies: ", dependencies);
  Promise.all([
    import("https://unpkg.com/idb?module"),
    ...dependencies.map(addDependency),
    // Somehow this import does not work... I'll use builtin eval for now
    //fetch("https://unpkg.com/bigeval").then(response=>response.text()).then(text=>Function(text))
  ]).then(async ([idb]) => {
    db = await idb.openDB(settings.DATABASE_NAME, settings.DATABASE_VERSION);

    // Init dependencies
    // TODO: Make sure init blocks are reentrant while development
    for (const smartCommand of enabledSmartCommands) {
      if (smartCommand.init) {
        smartCommand.init();
      }
    }

    let rems = await findAllRem();
    rems.map(resetRem);
    await Promise.all(rems.map(prepareLifeCycle));

    // FIXME: This is run to detect new rem. I have not hooked up the created hook yet.
    setInterval(async function () {
      const rems = await findAllRem();
      await Promise.all(rems.map(prepareLifeCycle));
    }, 2000);
  });
}

function resetRem(el) {
  delete el.remData;
  if (el.remLifeCycleHooks) {
    for (const [event, hook] of Object.entries(el.remLifeCycleHooks)) {
      el.removeEventListener(event, hook);
    }
  }
  delete el.remLifeCycleHooks;
  if (el.remSmartResult) el.remSmartResult.remove();
}

f();
