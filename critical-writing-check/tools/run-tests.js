// Runs the checker over test-samples at each level, with and without the sample brief.
// macOS: /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tools/run-tests.js -- [--verbose] test-samples/*.txt
var isNode = typeof require === "function";
var args = isNode ? process.argv.slice(2) : Array.prototype.slice.call(arguments);
var read = isNode ? (p => require("fs").readFileSync(p, "utf8")) : readFile;
var out = isNode ? console.log : print;
var html = read("index.html");
var cfg = html.slice(html.indexOf("const CONFIG"), html.indexOf("/* ===== CONFIG END"));
var eng = html.slice(html.indexOf("/* ===== ENGINE START"), html.indexOf("/* ===== ENGINE END"));
var api = (0, eval)("(function(){" + cfg + "\n" + eng + "\nreturn {analyse:analyse,parseBrief:parseBrief};})()");
var verbose = args.includes("--verbose");
var briefFile = args.find(a => /brief/.test(a));
var b = briefFile ? api.parseBrief(read(briefFile)) : null;
if (b) out("BRIEF " + JSON.stringify(b));
var brief = b && { wordMin: b.wordMin, wordMax: b.wordMax, los: b.los.join("\n"), criteria: b.criteria.join("\n"), keyTerms: b.keyTerms.join(", ") };
args.filter(a => a.endsWith(".txt") && !/brief/.test(a)).forEach(f => {
  var row = [4, 5, 6, 7].map(L => {
    var r = api.analyse(read(f), L, { mode: "full", brief: brief });
    if (verbose && L === 6) r.items.forEach(i => out("   L6 [" + i.ruleId + "] " + (i.p != null && i.s != null ? r.doc.paras[i.p].sentences[i.s].text.slice(0, 70) : i.p != null ? "[para]" : "[doc]") + " <- " + i.detected.slice(0, 60)));
    return "L" + L + "=" + r.items.length;
  });
  out(f.split("/").pop() + "  " + row.join("  "));
});
