// Opens an AEP in the running After Effects instance.
//
// AE 2027 defers app.open() until the calling script ends, so this script
// only requests the switch; the caller waits and then runs the dump.
//
// The AEP path is read from .tmp/rec-aep-open.txt so the same script can
// open any project.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var pathFile = new File(ROOT + "/.tmp/rec-aep-open.txt");
  var target = "";
  try {
    pathFile.encoding = "UTF-8";
    if (pathFile.open("r")) {
      target = pathFile.read();
      pathFile.close();
    }
  } catch (e) {}
  target = String(target).replace(/^\s+|\s+$/g, "");
  var log = new File(ROOT + "/.tmp/rec-aep-open.log");
  try {
    log.encoding = "UTF-8";
    log.open("w");
    log.write("REQUEST " + target + " " + new Date().toString());
    log.close();
  } catch (e) {}
  if (!target) {
    var d0 = new File(ROOT + "/.tmp/rec-aep-open.done");
    d0.open("w");
    d0.write("no-path");
    d0.close();
    return;
  }
  try {
    app.open(new File(target));
  } catch (e) {
    try {
      var lg = new File(ROOT + "/.tmp/rec-aep-open.log");
      lg.open("a");
      lg.write("\nERROR " + String(e && e.message ? e.message : e));
      lg.close();
    } catch (e2) {}
  }
  var d = new File(ROOT + "/.tmp/rec-aep-open.done");
  d.open("w");
  d.write("done");
  d.close();
})();
