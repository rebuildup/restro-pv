// Close current project without saving and reopen REC-D.aep fresh.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var LOG = ROOT + "/.tmp/rec-newmat/rec-d-reset.log";
  var lines = [];
  function log(s) { lines.push(String(s)); try { var f = new File(LOG); f.encoding="UTF-8"; f.open("w"); f.write(lines.join("\n")); f.close(); } catch(e){} }
  try {
    log("START " + new Date().toString());
    if (app.project) {
      app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
    }
    var f = new File(ROOT + "/verification/rec-d/REC-D.aep");
    var p = app.open(f);
    log("opened " + (p ? p.file.name : "?"));
    try { app.updateUI(); } catch (e) {}
  } catch (e) {
    log("ERROR " + String(e && e.message ? e.message : e));
  }
  log("DONE");
})();
