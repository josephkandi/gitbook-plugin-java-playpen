// ECMAScript 6 Backwards compatability
if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function(str) {
    return this.slice(0, str.length) == str;
  };
}

// Regex for finding new lines
var newLineRegex = /(?:\r\n|\r|\n)/g;

// Background colors for program result on success/error
var successColor  = "#4caf50";
var errorColor    = "#e51c23";
var noOutputColor = "#ff9800";
var panelResultDiv = document.querySelector("#panel-result");
// Error message to return when there's a server failure
var errMsg = "The server encountered an error while running the program.";

// Stores ACE editor markers (highights) for errors
var markers = [];

// Status codes, because there are no enums in Javascript
var SUCCESS = 0;
var ERROR   = 1;

// Original source code
var Range;

// Maximum length of a response before it has to be truncated
var MAX_RESPONSE_LENGTH = 50000;

function init(){
  blocks = document.querySelectorAll(".active-code");

  if (blocks.length == 0)
    return;

  for (var i = 0; i < blocks.length; i++) {
    initEditor(blocks[i]);
  }
}

function initEditor(block) {
  var editorDiv   = block.querySelector(".editor")
  var resetButton = block.querySelector(".reset-code");
  var runButton   = block.querySelector(".run-code");
  var resultDiv   = block.querySelector(".result");
  var panelResultDiv = block.querySelector("#panel-result");    

  if (editorDiv == null) {
    return;
  }

  // Setup ace editor
  
  var editor  = ace.edit(editorDiv);
  ace.require("ace/ext/language_tools");    
  Range       = ace.require('ace/range').Range;

  var executeCode = function(ev) {
    resultDiv.style.display = "block";
    resultDiv.innerHTML = "Running...";
    panelResultDiv.style.display = "block";
	panelResultDiv.className = "alert alert-dismissible alert-info";

    // Clear previous markers, if any
    markers.map(function(id) { editor.getSession().removeMarker(id); });

    // Get the code, run the program
    var program = editor.getValue();
    runProgram(program, resultDiv, editor, handleResult);
  };

  ace.config.setModuleUrl('ace/mode/java', '/gitbook/plugins/gitbook-plugin-java-playpen/mode-java.js');
  
  editor.setOptions({
      enableBasicAutocompletion: true,
      enableSnippets: true,
      fontSize: "10pt",
      enableLiveAutocompletion: true
  });

  editor.setTheme("ace/theme/tomorrow");
  editor.getSession().setMode("ace/mode/java");
  editor.setShowPrintMargin(true);
  editor.renderer.setShowGutter(true);
  editor.setHighlightActiveLine(false);
  editor.commands.addCommand({
      name: "run",
      bindKey: {
          win: "Ctrl-Enter",
          mac: "Ctrl-Enter"
      },
      exec: executeCode
  })

  var originalCode = editor.getSession().getValue();

  // Set initial size to match initial content
  updateEditorHeight(editor, editorDiv);

  // Registering handler for run button click
  runButton.addEventListener("click", executeCode);

  // Registering handler for reset button click
  resetButton.addEventListener("click", function(ev) {
    // Clear previous markers, if any
    markers.map(function(id) { editor.getSession().removeMarker(id); });

    editor.getSession().setValue(originalCode);
    //resultDiv.style.display = "none";
    panelResultDiv.style.display = "none";  
	panelResultDiv.className = "alert";
  });

  editor.on('change', function(){
    updateEditorHeight(editor, editorDiv);
  });

  // Highlight active line when focused
  editor.on('focus', function() {
    editor.setHighlightActiveLine(true);
  });

  editor.on('blur', function() {
    editor.setHighlightActiveLine(false);
  });
}

require(["gitbook"], function(gitbook) {
  gitbook.events.bind("page.change", function() {
    init();
  })
});

// Changes the height of the editor to match its contents
function updateEditorHeight(editor, editorDiv) {
  // http://stackoverflow.com/questions/11584061/
  var newHeight = editor.getSession().getScreenLength()
    * editor.renderer.lineHeight
    + editor.renderer.scrollBar.getWidth();

  editorDiv.style.height = Math.ceil(newHeight).toString() + "px";
  editor.resize();
};





//
// escapeHTML() borrowed from mustache.js:
// https://github.com/janl/mustache.js/blob/master/mustache.js#L43
//
// via:
// http://stackoverflow.com/questions/24816/escaping-html-strings-with-jquery/12034334#12034334
//
var entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': '&quot;',
  "'": '&#39;',
  "/": '&#x2F;'
};

function escapeHTML(unsafe) {
  return String(unsafe).replace(/[&<>"'\/]/g, function(s) {
    return entityMap[s];
  });
}

// Dispatches a XMLHttpRequest to the Rust playpen, running the program, and
// issues a callback to `callback` with the result (or null on error)
function runProgram(program, resultDiv, editor, callback) {
  var req = new XMLHttpRequest();

  //var data = "code=" + encodeURIComponent(program) + "&passargs=&respond=respond";
  var data = "sourceCode=" + encodeURIComponent(program);
      
  req.open('POST', "https://code.peruzal.com/api", true);
  req.onload = function(e) {
    if (req.readyState === 4 && req.status === 200) {
      var result      = JSON.parse(req.response);
      
      var buildResult = result.output;	  

      var statusCode = SUCCESS;
      if (buildResult.indexOf("error") > -1) {
        statusCode = ERROR;
      }

      callback(statusCode, resultDiv, editor, buildResult);
    } //else {
//      callback(false, null, null);
//    }
  };

  req.onerror = function(e) {
    callback(false, null);
  }

  req.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  req.send(data);
}

// The callback to runProgram
function handleResult(statusCode, resultDiv, editor, message) {

  // Check the size of the message, shorten it if
  // it's too big to be appended to the DOM.
  if ( message.length > MAX_RESPONSE_LENGTH ) {
    message = message.slice(0, MAX_RESPONSE_LENGTH / 2)
            + '\n\n--- THIS RESULT HAS BEEN SHORTENED ---\n\n'
            + message.slice(-MAX_RESPONSE_LENGTH / 2);
  }

  // Dispatch depending on result type
  if (message == null) {
	 panelResultDiv.className = "alert alert-dismissible alert-danger";
    resultDiv.innerHTML = errMsg;
  } else if(message.length == 0){
      resultDiv.innerHTML = "No output";
      panelResultDiv.className = "alert alert-dismissible alert-warning";
  } else if (statusCode == SUCCESS) {
    handleSuccess(message, resultDiv);
  } else {
    handleError(message, editor, resultDiv);
  }
}

// Called on successful program run
function handleSuccess(message, resultDiv) {
  panelResultDiv.className = "alert alert-dismissible alert-success";
  var lines = message.split(newLineRegex);
  message = lines.map(function(line) {
    return escapeHTML(line);
  }).join('<br />');
  resultDiv.innerHTML = message;
}

// Called when program run results in error(s)
function handleError(message, editor, resultDiv) {
  panelResultDiv.className = "alert alert-dismissible alert-danger";
  var lines = message.split(newLineRegex);
  message = lines.map(function(line) {
    return escapeHTML(line);
  }).join('<br />');
  resultDiv.innerHTML = message;  
 //handleProblem(message, editor, resultDiv, "error");
}

// Called on unsuccessful program run. Detects and prints problems (either
// warnings or errors) in program output and highlights relevant lines and text
// in the code.
function handleProblem(message, editor, resultDiv, problem) {
  // Getting list of ranges with problems
  var lines = message.split(newLineRegex);
  var ranges = parseProblems(lines);

  // Cleaning up the message: keeps only relevant problem output
  var cleanMessage = lines.map(function(line) {
    if (line.startsWith("/tmp/java_")) {
      var errIndex = line.indexOf(problem + ": ");
      if (errIndex !== -1) return line.slice(errIndex);
      return "";
    }

    // Discard playpen messages, keep the rest
    return line;
  }).filter(function(line) {
    return line !== "";
  }).map(function(line) {
    return escapeHTML(line);
  }).join("<br />");

  // Setting message
  resultDiv.innerHTML = cleanMessage;

  // Highlighting the lines
  var ranges = parseProblems(lines);
  markers = ranges.map(function(range) {
    return editor.getSession().addMarker(range, "ace-" + problem + "-line",
      "fullLine", false);
  });
}

// Parses a problem message returning a list of ranges (row:col, row:col) where
// problems in the code have occured.
function parseProblems(lines) {
  var ranges = [];
  for (var i in lines) {
    var line = lines[i];
    if (line.indexOf(".java:") !== -1) {
      var parts = line.match(/.java:(\d+):/).splice(1);
      ranges.push(new Range(parseInt(parts[0], 10) - 1, 0, parseInt(parts[0], 10) - 1, 100));
    }
  }

  return ranges;
}
