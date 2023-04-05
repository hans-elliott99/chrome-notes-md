/** CHROME NOTES
 * Author: Hans Elliott
 * 
 * A simple markdown-style note taking extension for Chrome
 * Very basic so it should be easily editable and private.
 * Your data is stored using the chrome.storage API: 
 *    https://developer.chrome.com/docs/extensions/reference/storage/
 * I use chrome.storage.sync, edit as desired.
 * 
 * To use, download this file's parent folder, navigate to chrome://extensions/
 * in your chrome-browser, enable developer mode, select 'load unpacked', and
 * then select this file's parent folder.
 * 
 * The 'backup' function in this extension uses Chrome's fileStystem api, which
 * is technically only available to apps, and not extensions.
 */

// General globals
let currentTabNum = 1;
const tabButtons = document.querySelectorAll(".tabbutton");
const tabContents = document.querySelectorAll(".tabcontent");
const noteTextareas = document.querySelectorAll(".note textarea");
const notePreviews = document.querySelectorAll(".note-preview");
const backupButtons = document.getElementsByClassName('backup-button');
const minButton = document.getElementById('minimize-button'); //minimize
const previews = document.querySelectorAll('.preview'); //ie, markdown preview
const default_msg = "# Welcome to Chrome Notes!  \n- Use `markdown` syntax to style your notes. See [markdownguide.org](https://www.markdownguide.org/basic-syntax/) for an introduction.  \n- You can use #hastags to tag your notes.  \n- You can create syntax-highlighted `code` chunks by surrounding a block with three backticks and providing the name of a common language. For example:\n```python\nprint('thanks for trying chrome notes')\n```\n- Chrome Notes has simple source code and can be easily customized by editing values in `popup.css`.  \n\nEnjoy!"

// Globals for settings menu and params
const settingsButton = document.getElementById('settings-button');
const settingsMenu = document.getElementById('settings-menu');
const tabNameInputs = document.querySelectorAll('.tab-name-input')

// Globals for search bar
const searchBar = document.getElementById('search-bar');
const caseSensToggle = document.getElementById('case-checkbox');
const replaceBar = document.getElementById('replace-bar');
const replaceButton = document.getElementById('replace-button');
let replaceIndex = 0; //index to start replacing text at (in tab's string).

/* ///////////////////////////////////////////////////////////////////////////
  FILE SYSTEM API
  For backing up your text to a local file.
  Docs: https://developer.chrome.com/articles/file-system-access/
*/
async function getSaveFileHandle() {
  const options = {
    suggestedName: 'chrome_notes.md',
    startIn: 'documents',
    types: [
      {
        description: 'Text & Markdown Files',
        accept: {'text/plain': [
          '.txt', '.text',
          '.md', '.mkd', '.mdwn', '.mdown', '.mdtxt', '.mdtext', '.markdown',
        ]},
      }
    ],
  };
  const handle = await window.showSaveFilePicker(options);
  return handle;
}

async function writeFile(fileHandle, contents) {
  // Create a filestream and write to it
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  // Close the file, writing contents to disk
  await writable.close();
  console.log("File saved.");
}

async function backup() {
  // Combines all note data into one string and saves to a selected local file
  let combinedText = '';
  const promises = [];
  
  for (let i = 1; i <= tabButtons.length; i++) {
    const promise = new Promise((resolve, reject) => {
      chrome.storage.sync.get(['note-' + i], function(data) {
        var noteText = data['note-' + i] || "";
        combinedText += '<tab-'+i+'>\n\n' + noteText + '\n</tab-'+i+'>\n';
        resolve();
      });
    });
    promises.push(promise);
  }
  await Promise.all(promises);
  const blob = new Blob([combinedText], {type: 'text/plain'});

  /*File picker window & download text*/
  const fileHandle = await getSaveFileHandle();
  await writeFile(fileHandle, blob);
}

/* ////////////////////////////////////////////////////////////////////////////
  SETTINGS
  Enable customization of some features of the popup.
 */
// Update tab names with new value and save to chrome storage
function updateTabName(idx) {
  const tabButton = document.querySelector(`.tabbutton[data-tab="${idx+1}"]`);
  tabButton.textContent = tabNameInputs[idx].value;
  chrome.storage.sync.set({[`tab${idx+1}Name`]: tabNameInputs[idx].value});
}

// Load the tab names from chrome storage
function loadTabNames() {
  for (let i = 0; i < tabNameInputs.length; i++) {
    const tabNameInput = tabNameInputs[i];
    const tabButton = tabButtons[i];
    
    chrome.storage.sync.get(`tab${i+1}Name`, (result) => {
      var tabName = result[`tab${i+1}Name`] || `Tab ${i+1}`;
      tabNameInput.value = tabName;
      tabButton.textContent = tabName;
    });
  }
}

// Load last tab number and click appropriate tab button
function loadLastTab() {
  chrome.storage.sync.get(["currentTabNum"], function(data) {
    currentTabNum = data["currentTabNum"] || 1;
    console.log("tab restored:", currentTabNum);
    // Open last tab when popup is opened
    tabButtons[currentTabNum-1].click();
  })
}

/* ////////////////////////////////////////////////////////////////////////////
   SEARCH
   Add text search and replace functionality.
*/

// Markdown highlight text that matches the search bar input 
function highlightMatches(tabNum, query, startIndex = 0) {
  const preview = document.getElementById('preview-' + tabNum);
  const note = document.getElementById('note-text-' + tabNum);
  if (startIndex + query.length >= note.value.length) {
    console.log("startIndex >= note.value.length");
    startIndex = 0;
    replaceIndex = 0;
  }
  preview.innerHTML = marked.parse(note.value);
  if (query) {
    const regexArgs = caseSensToggle.checked ? "g" : "gi"
    const regex = new RegExp(query, regexArgs);
    preview.innerHTML = preview.innerHTML.replace(regex, function(match, idx) {
      if (idx > startIndex) {
        return '<mark>' + match + '</mark>';
      } else {
        return match;
      }
    });
  }
  stylePreview(tabNum);
}

// Replace the next instance of highlighted text with provided text
function replaceSelection(tabNum, newText, startIndex = 0) {
  const note = document.getElementById('note-text-' + tabNum);
  const preview = document.getElementById('preview-' + tabNum);
  const match = preview.querySelector('mark'); // just replace first match rn
  if (startIndex > note.value.length) {
    startIndex = 0;
    replaceIndex = 0; //global var
  }
  const selectedText = match.innerText;
  const start = note.value.slice(startIndex).indexOf(selectedText) + startIndex;
  const end = start + selectedText.length;
  const textBeforeMatch = note.value.slice(0, start);
  const textAfterMatch = note.value.slice(end);
  note.value = textBeforeMatch + newText + textAfterMatch;
  preview.innerHTML = marked.parse(note.value);

  // save changes to storage
  chrome.storage.sync.set({ ["note-" + tabNum] : note.value });
  
  // highlight the next matches, taking care to start highlight & replacement 
  // after the text we just replaced
  replaceIndex = start + newText.length;
  highlightMatches(tabNum, searchBar.value, replaceIndex);
}


/*/////////////////////////////////////////////////////////////////////////////
  SYNTAX HIGHLITING
*/

// Highlight hastagged words with special hastag class
function highlightHastags(tabNum) {
  const preview = document.getElementById('preview-' + tabNum);
  preview.innerHTML = preview.innerHTML.replace(/(?<!\/)(?<=^|\W)#\w+/g, function(match) { // /(^|\W)#(\w+)/g
      return '<span class="hashtag">' + match + '</span>';
  });
}

// Apply syntax highlighting to code blocks
function syntaxHighlightCode(tabNum) {
  const preview = document.getElementById('preview-' + tabNum);
  const codeBlocks = preview.querySelectorAll('code');
  for (let i = 0; i < codeBlocks.length; i++) {
    const code = codeBlocks[i];
    const language = code.getAttribute('class');
    if (language) {
      // If we explicitly require a language to be identified, we can have diff
      // types of code blocks. ie, `txt` can be styled differently than ```py...
      Prism.highlightElement(code);
    }// else {
    //   Prism.highlightElement(code);
    // }
  }
}

// Whenever the md preview is re-rendered, call this to apply all aesthetics
function stylePreview(tabNum) {
  highlightHastags(tabNum);
  syntaxHighlightCode(tabNum);
  // ...
}

/* //////////////////////////////////////////////////////////////////////////// 
  MAIN - Once DOM Content is Loaded:
    Automatically retrieve text from Chrome storage when popup is opened.
    Refresh Chrome storage for current tab as its data is edited.
    Toggle between text entry and markdown preview.
    Backup data to local file when desired.
    Handle Settings Menu events and other utility buttons.
*/
document.addEventListener("DOMContentLoaded", function() {

  // Load the notes from storage as soon as the popup is opened
  for (let i = 0; i < noteTextareas.length; i++) {
    chrome.storage.sync.get(["note-" + (i+1)], function(data) {
      var noteText = data["note-" + (i+1)] || default_msg;
      noteTextareas[i].value = noteText;
      previews[i].innerHTML = marked.parse(noteText);
    });
  }

  // Event listener for tab buttons which switches bewteen tabs & their data
  for (let i = 0; i < tabButtons.length; i++) {
    tabButtons[i].addEventListener("click", function(event) {
      // Remove "active" class from previously active tab button
      var prevActiveBtn = document.querySelector('.tabbutton.active');
      if (prevActiveBtn) {
        prevActiveBtn.classList.remove('active');
      }
      // Hide all tab contents
      for (let j = 0; j < tabContents.length; j++) {
        tabContents[j].style.display = "none";
      }
      // Show the current tab's content
      currentTabNum = this.dataset.tab;
      var tabContent = document.querySelector(`.tabcontent[data-tab="${currentTabNum}"]`);
      tabContent.style.display = "block";
      // Change current tab to active
      var newActiveBtn = document.querySelector(`.tabbutton[data-tab="${currentTabNum}"]`);
      newActiveBtn.classList.add('active');
      // Style the markdown preview (syntax highlighting, etc)
      stylePreview(currentTabNum);   
      // Save current tab number to chrome storage so user can open to same tab
      chrome.storage.sync.set({ ["currentTabNum"] : currentTabNum });
    });
  }

  // Event listener per textarea - update chrome storage whenever text is edited
  for (let i = 0; i < noteTextareas.length; i++) {
    noteTextareas[i].addEventListener("input", function() {
      var noteText = noteTextareas[i].value;
      chrome.storage.sync.set({ ["note-" + (i+1)] : noteText }, function() {
        previews[i].innerHTML = marked.parse(noteText);
        stylePreview(currentTabNum);
      });
    });
  }

  // Toggle Between Text-Entry & Markdown Preview
  for (let i = 0; i < notePreviews.length; i++) {
    var preview = notePreviews[i].querySelector(".preview");
    var noteTextarea = noteTextareas[i];
    preview.addEventListener("click", function(event) {
      notePreviews[i].classList.add("editing");
      noteTextareas[i].focus();
      // var clickPos = event.target.selectionStart;
      noteTextareas[i].setSelectionRange(0, 0);
      noteTextareas[i].scrollLeft = 0;
      noteTextareas[i].scrollTop = 0;
    });
    noteTextarea.addEventListener("blur", function() {
      notePreviews[i].classList.remove("editing");
    });
    noteTextarea.addEventListener("keydown", function(event) {
      // Ctrl+Enter exits editor mode
      if (event.key == "Enter" && event.ctrlKey) {
        notePreviews[i].classList.remove("editing");
      }
    });
  }

  /* BACKUP */
  // Event listener for each backup button that downloads the note text
  // Currently, just 1 backup button which downloads all tab content so the loop is redundant
  for (let i = 0; i < backupButtons.length; i++) {
    backupButtons[i].addEventListener("click", function() {
      console.log("backing up");
      backup();
    });
  }

  /* SETTINGS */
  // Settings menu button
  settingsButton.addEventListener('click', function() {
    settingsMenu.style.display = (settingsMenu.style.display === 'block' ? 'none' : 'block');
  });

  // Update tab button names when input is changed
  for (let i = 0; i < tabNameInputs.length; i++) {
    tabNameInputs[i].addEventListener('input', function() {
      updateTabName(i);
    });
  }

  /* MINIMIZE */
  minButton.addEventListener('click', function() {
    // Hide all tab contents
    for (let i = 0; i < tabContents.length; i++) {
      tabContents[i].style.display = "none";
      tabButtons[i].classList.remove('active'); //button color is reset
    }
  });

  /* SEARCH */
  // add an event listener to the search bar
  searchBar.addEventListener("input", function() {
    highlightMatches(currentTabNum, searchBar.value, 0);
    replaceIndex = 0;
  });
  caseSensToggle.addEventListener('change', function() {
    console.log("case sensitive search:", this.checked);
    //rehighlight  
    highlightMatches(currentTabNum, searchBar.value, 0);
  })
  replaceButton.addEventListener("click", function() {
    replaceSelection(currentTabNum, replaceBar.value, replaceIndex);
  })

  /* ON EXIT */
  // Ensure all edits are saved when popup is closed
  window.addEventListener("beforeunload", function() {
    // Could loop through all the note textareas and save their contents,
    // but prev visited and unvisited tabs should already be saved. So limit to
    // saving just the current tab.
    chrome.storage.sync.set({ ["note-" + (currentTabNum)] : noteTextareas[i].value });    
  });


  /* ON STARTUP */
  loadTabNames();
  loadLastTab();

}); //DOMContentLoaded
