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


// General Globals
let currentTabNum = 1;
const tabButtons = document.querySelectorAll(".tabbutton");
const tabContents = document.querySelectorAll(".tabcontent");
const noteTextareas = document.querySelectorAll(".note textarea");
const notes = document.getElementsByClassName('note');
const backupButtons = document.getElementsByClassName('backup-button');
const minButton = document.getElementById('minimize-button');
const previews = document.querySelectorAll('.preview'); //ie, markdown preview

// Globals for settings menu
const settingsButton = document.getElementById('settings-button');
const settingsMenu = document.getElementById('settings-menu');
const tabNameInputs = document.querySelectorAll('.tab-name-input')

// Globals for search bar
const searchBar = document.getElementById('search-bar');
const caseSensToggle = document.getElementById('case-checkbox');
const replaceBar = document.getElementById('replace-bar');
const replaceButton = document.getElementById('replace-button');
let replaceIndex = 0; //index to start replacing text at.

/*
  HELPERS
*/

/* 
  FILE SYSTEM API
  For backing up your text to a local file.
  Docs: https://developer.chrome.com/articles/file-system-access/
*/
async function getSaveFileHandle() {
  const options = {
    suggestedName: 'my_notes.md',
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
        const noteText = data['note-' + i] || "";
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

/* SETTINGS
    Enable customization of some features of the popup.
 */
// Edit tab names
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
      const tabName = result[`tab${i+1}Name`] || `Tab ${i+1}`;
      tabNameInput.value = tabName;
      tabButton.textContent = tabName;
    });
  }
}

function loadLastTab() {
  chrome.storage.sync.get(["currentTabNum"], function(data) {
    currentTabNum = data["currentTabNum"] || 1;
    console.log("tab restored:", currentTabNum);
    // Open last tab when popup is opened
    tabButtons[currentTabNum-1].click();
  })
}

/* SEARCH */
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
}


function replaceSelection(tabNum, newText, startIndex = 0) {
  const note = document.getElementById('note-text-' + tabNum);
  const preview = document.getElementById('preview-' + tabNum);
  const match = preview.querySelector('mark'); // just replace first match rn
  if (startIndex > note.value.length) {
    startIndex = 0;
    replaceIndex = 0; //global
  }
  var selectedText = match.innerText;
  var start = note.value.slice(startIndex).indexOf(selectedText) + startIndex;
  var end = start + selectedText.length;
  var textBeforeMatch = note.value.slice(0, start);
  var textAfterMatch = note.value.slice(end);
  note.value = textBeforeMatch + newText + textAfterMatch;
  preview.innerHTML = marked.parse(note.value);

  // save data changes
  chrome.storage.sync.set({ ["note-" + tabNum] : note.value });
  
  // highlight the next matches, taking care to start highlight & replacement 
  // after the text we just replaced
  replaceIndex = start + newText.length;
  highlightMatches(tabNum, searchBar.value, replaceIndex);
}


/* MAIN
    Store text data in Chrome storage individually for each tab buffer.
    Automatically retrieve text from Chrome storage when popup is opened. 
    Wait for input, then update Chrome storage automatically.
    Render markdown preview simultaneously.
    Backup data to local file when desired.
*/
document.addEventListener("DOMContentLoaded", function() {

  // Restore any saved settings
  loadTabNames();
  loadLastTab();

  // Load the notes from storage when the popup is opened
  for (let i = 0; i < noteTextareas.length; i++) {
    chrome.storage.sync.get(["note-" + (i+1)], function(data) {
      const noteText = data["note-" + (i+1)] || "";
      noteTextareas[i].value = noteText;
      previews[i].innerHTML = marked.parse(noteText);
    });
  }

  // Event listener for tab buttons which switches bewteen tabs / data
  for (let i = 0; i < tabButtons.length; i++) {
    tabButtons[i].addEventListener("click", function(event) {
      // Remove "active" class from previously active tab button
      const prevActiveBtn = document.querySelector('.tabbutton.active');
      if (prevActiveBtn) {
        prevActiveBtn.classList.remove('active');
      }
      // Hide all tab contents
      for (let j = 0; j < tabContents.length; j++) {
        tabContents[j].style.display = "none";
      }
      // Show the current tab's content
      currentTabNum = this.dataset.tab;
      const tabContent = document.querySelector(`.tabcontent[data-tab="${currentTabNum}"]`);
      tabContent.style.display = "block";
      // Change current tab to active
      const newActiveBtn = document.querySelector(`.tabbutton[data-tab="${currentTabNum}"]`);
      newActiveBtn.classList.add('active');    
      
      // Save current tab number to chrome storage
      chrome.storage.sync.set({ ["currentTabNum"] : currentTabNum });
    });
  }

  // Event listener per textarea - update chrome storage when text is edited
  for (let i = 0; i < noteTextareas.length; i++) {
    noteTextareas[i].addEventListener("input", function() {
      const noteText = noteTextareas[i].value;
      chrome.storage.sync.set({ ["note-" + (i+1)] : noteText }, function() {
        previews[i].innerHTML = marked.parse(noteText);
      });
    });
  }

  // Event listener for each backup button that downloads the note text
  // Currently, just 1 backup button which downloads all tab content so the loops is redundant
  for (let i = 0; i < backupButtons.length; i++) {
    backupButtons[i].addEventListener("click", function() {
      console.log("backing up");
      backup(); //could use backup_indiv(i+1) for separate backups per tab, see below
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


  /* SEARCH */
  // add an event listener to the search bar
  searchBar.addEventListener("input", function() {
    highlightMatches(currentTabNum, searchBar.value, 0);
    replaceIndex = 0;
  });
  caseSensToggle.addEventListener('change', function() {
    console.log("case sensitive search:", this.checked);  
  })
  replaceButton.addEventListener("click", function() {
    replaceSelection(currentTabNum, replaceBar.value, replaceIndex);
  })

  /* MINIMIZE */
  minButton.addEventListener('click', function() {
    // Hide all tab contents
    for (let i = 0; i < tabContents.length; i++) {
      tabContents[i].style.display = "none";
      tabButtons[i].classList.remove('active'); //button color is reset
    }
  });
  

}); //DOM



// // Backup functionality w/ separate backup per tab:
// function backup_inidiv(tabNum) {
//   chrome.storage.sync.get(['note-' + tabNum], function(data) {
//     const noteText = data['note-' + tabNum] || "";
//     const blob = new Blob([noteText], {type: 'text/plain'});
//     const url = URL.createObjectURL(blob);
//     chrome.downloads.download({
//       url: url,
//       filename: 'my_note.txt',
//       saveAs: true
//     });
//   });
// }