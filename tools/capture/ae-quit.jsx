// Close the disposable probe project without saving, then quit AE.
(function () {
  var ROOT = "C:/Users/rebui/Desktop/restro-pv-23";
  var f = new File(ROOT + "/.tmp/ae-quit.txt");
  f.open("w"); f.write("quitting"); f.close();
  try { app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES); } catch (e) {}
  try { app.quit(); } catch (e) {}
})();
