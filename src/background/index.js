import { SERVICES } from './data'

const resetDefaultSuggestion = () => chrome.omnibox.setDefaultSuggestion({
  description: '<url><match>gcp:</match></url> Quick Launch GCP'
});

const updateDefaultSuggestion = (text, isLogined, defaultProject) => {
  let description = '<match><url>gcp</url></match><dim> [</dim>';

  if (isLogined) {
    const isProject = /^p:/.test(text);
    const isSetDefault = /^set:/.test(text);
    const isLogout = (text === 'logout');
    const isSync = (text === 'sync');
    const isPlaintext = text.length && !isProject && !isSetDefault && !isLogout && !isSync;

    description +=
      isPlaintext ? ('<match>' + text + '</match>') : 'plaintext-search';
    description += '<dim> | </dim>';
    description += isProject ? ('<match>' + text + '</match>') : 'p:project-search plaintext-search';
    description += '<dim> | </dim>';
    description += isSetDefault ? ('<match>' + text + '</match>') : defaultProject ? `set:default-project (${defaultProject})` : 'set:default-project';
    description += '<dim> | </dim>';
    description += isLogout ? '<match>logout</match>' : 'logout';
    description += '<dim> | </dim>';
    description += isSync ? '<match>sync</match>' : 'sync';
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

const getTokenAsync = async () => new Promise((resolve, reject) => chrome.identity.getAuthToken({ 'interactive': true }, (token) => resolve(token)))

const revokeAsync = async () => new Promise((resolve, reject) => chrome.identity.getAuthToken({ 'interactive': false }, (current_token) => {
  if (!chrome.runtime.lastError) {
    chrome.identity.removeCachedAuthToken({ token: current_token }, () => { });
    let xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://accounts.google.com/o/oauth2/revoke?token=' + current_token);
    xhr.send();
    resolve()
  }
}))

const getProjectAsync = async (token) => new Promise((resolve, reject) => fetch("https://cloudresourcemanager.googleapis.com/v1/projects", {
  method: "GET", headers: { authorization: `Bearer ${token}` }
}).then(res => res.json()).then(data => resolve(data.projects.sort((a, b) => {
  let x = a.projectId.toLowerCase()
  let y = b.projectId.toLowerCase()
  return ((x < y) ? -1 : ((x > y) ? 1 : 0))
}))))

const encodeXml = (s) => {
  var holder = document.createElement('div');
  holder.textContent = s;
  return holder.innerHTML;
}

const matchString = (str, find) => {
  let r = []
  str.split(" ").forEach(s => {
    if (new RegExp(/&\w+;/).test(s) && s !== find) {
      r.push(s)
    } else {
      var reg = new RegExp('(' + find + ')', 'gi');
      r.push(s.replace(reg, `<match>$1</match>`))
    }
  })

  return r.join(" ")
}

const navigate = (url) => chrome.tabs.create({ active: true, url: url }, (tab) => { });

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
    if (text == '')
      return;

    let results = []
    const [p1, ...[subQuery]] = text.split(" ")
    let [key, query] = p1.split(":")

    switch (key) {
      case "set":
        if (query) {
          projects.filter(p => p.projectId.includes(query)).forEach(p => {
            results.push({
              content: `set:${p.projectId}`,
              description: (() => {
                const buf = p.projectId.replace(query, `<match>${query}</match>`)
                return `${buf} (${p.name})`
              })()
            });
          })
        } else {
          projects.forEach(p => {
            results.push({
              content: `set:${p.projectId}`,
              description: `${p.projectId} (${p.name})`
            });
          })
        }
        break;
      case "p":
        const [tp] = projects.filter(p => p.projectId.includes(query))
        if (!tp)
          return

        if (subQuery) {
          const { projectId } = tp
          let buf = []
          SERVICES.filter(m => m.name.toLowerCase().includes(subQuery)).forEach(m => {
            buf.push({
              content: `${m.url.replace(new RegExp(/PROJECT_ID/g), projectId)}`,
              description: matchString(encodeXml(m.name), encodeXml(subQuery))
            })
          })
          results.push(...buf.slice(0, 8))
        } else {
          if (query) {
            projects.filter(p => p.projectId.includes(query)).forEach(p => {
              results.push({
                content: `p:${p.projectId}`,
                description: p.projectId.replace(query, `<match>${query}</match>`)
              });
            })
          } else {
            projects.forEach(p => {
              results.push({
                content: `p:${p.projectId}`,
                description: p.projectId
              });
            })
          }
        }
        break
      default:
        let buf = []
        SERVICES.filter(m => m.name.toLowerCase().includes(text)).forEach(m => {
          buf.push({
            content: `${m.url.replace(new RegExp(/PROJECT_ID/g), defaultProject ? defaultProject : (projects ? projects[0].projectId : ''))}`,
            description: matchString(encodeXml(m.name), encodeXml(text))
          })
        })
        results.push(...buf)
        break;
    }
    suggest(results)
  })

  chrome.omnibox.onInputEntered.addListener(async (text) => {
    if (/^(https:|http:|www\.)\S*/.test(text)) {
      navigate(text)
    } else if (/^set:/.test(text)) {
      const [projects] = await getLocalStorageAsync('projects');
      const [_, projectId] = text.split(":")
      if (projects.map(p => p.projectId).includes(projectId)) {
        await setLocalStorageAsync({ defaultProject: projectId })
      }
    } else if (text === 'login' || text === "sync") {
      const token = await getTokenAsync()
      const projects = await getProjectAsync(token)
      await setLocalStorageAsync({ projects })
    } else if (text === "logout") {
      await revokeAsync()
      await setLocalStorageAsync({ projects: null, defaultProject: null })
      updateDefaultSuggestion()
    } else {
      console.log(text)
    }
  })
})()