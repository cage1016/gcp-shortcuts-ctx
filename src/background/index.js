import { SERVICES } from './data'

const resetDefaultSuggestion = () => chrome.omnibox.setDefaultSuggestion({
  description: '<url><match>g:</match></url> Quick Launch GCP'
});

const updateDefaultSuggestion = (text, isLogined, defaultProject) => {
  let description = '<match><url>g</url></match><dim> [</dim>';

  if (isLogined) {
    const isProject = /^p:/.test(text);
    const isSetDefault = /^set:/.test(text);
    const isLogout = (text === 'logout');
    const isSync = (text === 'sync');
    const isHelp = (text === 'help');
    const isReset = (text === 'reset');
    const isPlaintext = text.length && !isProject && !isSetDefault && !isLogout && !isSync && !isHelp && !isReset;

    description +=
      isPlaintext ? ('<match>' + text + '</match>') : 'plaintext-search';
    description += '<dim> | </dim>';
    description += isProject ? ('<match>' + text + '</match>') : 'p:project-search,plaintext-search';
    description += '<dim> | </dim>';
    description += isSetDefault ? ('<match>' + text + '</match>') : defaultProject ? `set:default-project (${defaultProject.name})` : 'set:default-project';
    description += '<dim> | </dim>';
    description += isLogout ? '<match>logout</match>' : 'logout';
    description += '<dim> | </dim>';
    description += isSync ? '<match>sync</match>' : 'sync';
    description += '<dim> | </dim>';
    description += isReset ? '<match>reset</match>' : 'reset';
    description += '<dim> | </dim>';
    description += isHelp ? '<match>help</match>' : 'help';
  } else {
    description += (text === 'login') ? ' <match>login</match>' : 'login';
  }
  description += '<dim> ]</dim>';

  chrome.omnibox.setDefaultSuggestion({ description: description });
}

Object.byString = function (o, ...theArgs) {
  let result = []
  theArgs.forEach(s => {
    result.push(
      ((o) => {
        s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
        s = s.replace(/^\./, '');           // strip a leading dot
        var a = s.split('.');
        for (var i = 0, n = a.length; i < n; ++i) {
          var k = a[i];
          if (k in o) {
            o = o[k];
          } else {
            return;
          }
        }
        return o;
      })(o)
    )
  })
  return result
}

const getLocalStorageAsync = async (...theArgs) => {
  const { state } = await new Promise((resolve, reject) => chrome.storage.local.get(['state'], (res) => resolve(res)))
  const s = state ? JSON.parse(state) : {}

  if (theArgs.length) {
    return Object.byString(s, ...theArgs)
  } else {
    return s
  }
}

const setLocalStorageAsync = async (data) => {
  const state = await getLocalStorageAsync()
  return new Promise((resolve, reject) => chrome.storage.local.set({
    state: JSON.stringify(Object.assign({}, state, data)),
  }, () => resolve()))
}

const getTokenAsync = async () => new Promise((resolve, reject) => chrome.identity.getAuthToken({ 'interactive': true }, (token, err) => {
  resolve(token)
}))

const revokeAsync = async () => new Promise((resolve, reject) => chrome.identity.getAuthToken({ 'interactive': false }, (current_token) => {
  if (!chrome.runtime.lastError) {
    chrome.identity.removeCachedAuthToken({ token: current_token }, () => { });
    let xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://accounts.google.com/o/oauth2/revoke?token=' + current_token);
    xhr.send();
    resolve()
  }else{
    resolve()
  }
}))

const getProjectAsync = async (token) => new Promise((resolve, reject) => fetch("https://cloudresourcemanager.googleapis.com/v1/projects", {
  method: "GET", headers: { authorization: `Bearer ${token}` }
}).then(res => res.json()).then(({ error, projects }) => {
  if (error) {
    reject(error.message)
  } else {
    resolve(projects.sort((a, b) => {
      let x = a.projectId.toLowerCase()
      let y = b.projectId.toLowerCase()
      return ((x < y) ? -1 : ((x > y) ? 1 : 0))
    }))
  }
})).catch(err => {
  console.error("getProjectAsync err", err)
})

const encodeXml = (s) => {
  var holder = document.createElement('div');
  holder.textContent = s;
  return holder.innerHTML;
}

const matchString = (str, find, caseSensitive = true) => {
  let result = []
  const flags = caseSensitive ? 'gi' : 'g';
  const keywords = find.split(" ").filter(x => x).sort((a, b) => b.length - a.length)
  const keywordRegex = RegExp(keywords.join('|'), flags)
  if (keywordRegex.test(str)) {
    let lastIdx = 0
    str.replace(keywordRegex, (match, idx) => {
      const part = str.slice(lastIdx, idx)
      result.push(part)
      if (part.length) {
        const _prefix = part.split(" ").pop()
        result.push(!_prefix.startsWith("&") ? `<match>${match}</match>` : match)
      } else {
        result.push(!match.startsWith("&") ? `<match>${match}</match>` : match)
      }
      lastIdx = idx + match.length
    })
    const end = str.slice(lastIdx)
    result.push(end)
    return result.join("")
  }
  return str
}

const navigate = (url) => chrome.tabs.create({ active: true, url: url }, (tab) => { });

const filterFunc = (str, find) => {
  let count = {}
  const keywords = find.split(" ").filter(x => x).sort((a, b) => b.length - a.length)
  const keywordRegex = RegExp(keywords.join('|'), "gi")
  str.replace(keywordRegex, (match, idx) => {
    if (!count.hasOwnProperty(match.toLocaleLowerCase())) {
      count[match.toLocaleLowerCase()] = 0
    }
    count[match.toLocaleLowerCase()] += 1
  })
  return Object.keys(count).length === keywords.length
}

(async () => {
  resetDefaultSuggestion()

  chrome.omnibox.onInputStarted.addListener(async () => {
    const [projects, defaultProject] = await getLocalStorageAsync('projects', 'defaultProject');
    if (projects) {
      updateDefaultSuggestion('', projects, defaultProject)
    } else {
      resetDefaultSuggestion()
    }
  })

  chrome.omnibox.onInputCancelled.addListener(() => resetDefaultSuggestion())

  chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const [projects, defaultProject] = await getLocalStorageAsync('projects', 'defaultProject');
    updateDefaultSuggestion(encodeXml(text), projects, defaultProject);
    if (text == '' || text == 'login' || text == 'logout' || text == 'reset')
      return;

    if (!projects){
      return;
    }

    let results = []
    let key = null
    let sq = null, mq = null, buf = null
    if (text.includes(":")) {
      if (!text.includes(",")) {
        [key, mq] = text.split(":")
      } else {
        [key, buf] = text.split(":");
        [mq, sq] = buf.split(",");
      }
    } else {
      key = text
    }

    switch (key) {
      case "help":
        results.push(...[
          {
            content: " ",
            description: "plaintext-search <dim>GCP console menu search</dim>"
          },
          {
            content: "p:",
            description: "p:project-search,plaintext-search <dim>project search,GCP console menu search</dim>"
          },
          {
            content: "set:",
            description: "set:default-project <dim>Set default gcloud project</dim>"
          },
          {
            content: "reset",
            description: "reset <dim>Reset default gcloud project</dim>"
          },
          {
            content: "login",
            description: "login <dim>Login Google Account</dim>"
          },
          {
            content: "logout",
            description: "logout <dim>Logout Google Account</dim>"
          },
          {
            content: "sync",
            description: "sync <dim>Sync gcloud projects</dim>"
          }
        ])
        break
      case "set":
        projects.
          filter(p => mq ? filterFunc(`${p.projectId} (${p.name})`, mq) : true).
          forEach(p => {
            results.push({
              content: `set:${p.projectId}`,
              description: `${matchString(encodeXml(p.projectId), encodeXml(mq))} - <dim>${matchString(encodeXml(p.name), encodeXml(mq))}</dim>`
            });
          })
        break;
      case "p":
        if (sq) {
          let buf = []
          const [tpp] = projects.filter(p => mq ? filterFunc(`${p.projectId} (${p.name})`, mq) : true)
          if (tpp) {
            SERVICES.filter(m => filterFunc(m.name, sq)).forEach(m => {
              buf.push({
                content: `${m.url.replace(new RegExp(/PROJECT_ID/g), tpp.projectId)}`,
                description: `${matchString(encodeXml(m.name), encodeXml(sq))} - <dim>${tpp.name}</dim> - <url>${encodeXml(m.url.replace(new RegExp(/PROJECT_ID/g), tpp.projectId))}</url>`
              })
            })
            results.push(...buf.slice(0, 7))
          }
        } else {
          projects.
            filter(p => mq ? filterFunc(`${p.projectId} (${p.name})`, mq) : true).
            forEach(p => {
              results.push({
                content: `p:${p.projectId}`,
                description: `${matchString(encodeXml(p.projectId), encodeXml(mq))} - <dim>${matchString(encodeXml(p.name), encodeXml(mq))}</dim>`
              });
            })
        }
        break
      default:
        let buf = []
        const tpx = defaultProject ? defaultProject : (projects ? projects[0] : { projectId: "" })

        SERVICES.filter(m => filterFunc(m.name, text)).forEach(m => {
          buf.push({
            content: `${m.url.replace(new RegExp(/PROJECT_ID/g), tpx.projectId)}`,
            description: `${matchString(encodeXml(m.name), encodeXml(text))} - <dim>${tpx.name}</dim> - <url>${encodeXml(m.url.replace(new RegExp(/PROJECT_ID/g), tpx.projectId))}</url>`
          })
        })
        results.push(...buf.slice(0, 7))
        break;
    }
    suggest(results)
  })

  chrome.omnibox.onInputEntered.addListener(async (text) => {
    const [projects] = await getLocalStorageAsync('projects');
    if (projects){
      // login-ed
      if (/^(https:|http:|www\.)\S*/.test(text)) {
        navigate(text)
      } else if (/^set:/.test(text)) {
        const [projects] = await getLocalStorageAsync('projects');
        const [_, projectId] = text.split(":")
        const [tp] = projects.filter(p => p.projectId.includes(projectId))
        if (tp) {
          await setLocalStorageAsync({ defaultProject: tp })
        }
      } else if (text === "sync") {
        const token = await getTokenAsync()
        if (token) {
          const projects = await getProjectAsync(token)
          await setLocalStorageAsync({ projects })
        }
      } else if (text === "reset") {
        await setLocalStorageAsync({ defaultProject: null })
        updateDefaultSuggestion()
      } else if (text === "logout") {
        await revokeAsync()
        await setLocalStorageAsync({ projects: null, defaultProject: null })
        updateDefaultSuggestion()
      } else {
        console.log(`"${text}" do nothing`)
      }
    }else{
      // logout-ed
      if (text === 'login'){
        const token = await getTokenAsync()
        if (token) {
          const projects = await getProjectAsync(token)
          await setLocalStorageAsync({ projects })
        }
      }else{
        console.log(`"${text}" do nothing`)
      }
    }
  })
})()