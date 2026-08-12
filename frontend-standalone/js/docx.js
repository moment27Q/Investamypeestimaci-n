/* Generador de documentos Word (.docx) sin dependencias.
   Construye el paquete OOXML manualmente y lo empaqueta como ZIP (método STORE). */
(function () {
  "use strict";

  var W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  var REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var PACK = "http://schemas.openxmlformats.org/package/2006/relationships";
  var CT = "http://schemas.openxmlformats.org/package/2006/content-types";

  function xml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function run(t, bold) {
    var rPr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
    return "<w:r>" + rPr + "<w:t xml:space=\"preserve\">" + xml(t) + "</w:t></w:r>";
  }

  function runsFrom(node, bold) {
    var out = [];
    node.childNodes.forEach(function (n) {
      if (n.nodeType === 3) {
        var t = n.nodeValue;
        if (t.trim() !== "") out.push(run(t, bold));
      } else if (n.nodeType === 1) {
        var el = n;
        if (el.tagName === "BR") {
          out.push("<w:r><w:br/></w:r>");
        } else if (el.classList && el.classList.contains("fill")) {
          out.push(run(el.textContent, bold));
        } else {
          out = out.concat(runsFrom(el, bold));
        }
      }
    });
    return out;
  }

  function p(children, opts) {
    var o = opts || {};
    var pPr = "<w:pPr>";
    if (o.style) pPr += "<w:pStyle w:val=\"" + o.style + "\"/>";
    if (o.align) pPr += "<w:jc w:val=\"" + o.align + "\"/>";
    var sp = [];
    if (o.spBefore) sp.push("w:before=\"" + o.spBefore + "\"");
    if (o.spAfter != null) sp.push("w:after=\"" + o.spAfter + "\"");
    if (sp.length) pPr += "<w:spacing " + sp.join(" ") + "/>";
    if (o.indent) pPr += "<w:ind w:left=\"" + o.indent + "\"/>";
    if (o.border) pPr += "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"1\" w:color=\"000000\"/></w:pBdr>";
    pPr += "</w:pPr>";
    return "<w:p>" + pPr + children.join("") + "</w:p>";
  }

  function pageBreak() {
    return "<w:p><w:pPr><w:pageBreakBefore/></w:pPr></w:p>";
  }

  function tblPr(singleCell) {
    var borders = "";
    ["top", "left", "bottom", "right", "insideH", "insideV"].forEach(function (side) {
      borders += "<w:" + side + " w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"999999\"/>";
    });
    return "<w:tblPr>" +
      "<w:tblW w:w=\"0\" w:type=\"auto\"/>" +
      (singleCell ? "" : "<w:tblLayout w:type=\"autofit\"/>") +
      "<w:tblBorders>" + borders + "</w:tblBorders>" +
      "<w:tblCellMar>" +
      "<w:top w:w=\"60\" w:type=\"dxa\"/><w:left w:w=\"108\" w:type=\"dxa\"/>" +
      "<w:bottom w:w=\"60\" w:type=\"dxa\"/><w:right w:w=\"108\" w:type=\"dxa\"/>" +
      "</w:tblCellMar>" +
      "</w:tblPr>";
  }

  function grid(n) {
    var g = "<w:tblGrid>";
    for (var i = 0; i < n; i++) g += "<w:gridCol/>";
    return g + "</w:tblGrid>";
  }

  function tableXml(t) {
    var firstRow = t.querySelector("tr");
    var ncols = firstRow ? firstRow.querySelectorAll("th, td").length : 2;
    var rows = "";
    t.querySelectorAll("tr").forEach(function (tr) {
      var cells = "";
      var tot = tr.classList.contains("tot");
      var first = true;
      tr.querySelectorAll("th, td").forEach(function (cell) {
        var isTh = cell.tagName === "TH";
        var tcPr = "<w:tcPr>";
        if (isTh || tot) {
          tcPr += "<w:shd w:val=\"clear\" w:color=\"auto\" w:fill=\"" + (isTh ? "EEF1F6" : "F5ECD2") + "\"/>";
        }
        if (first && (isTh || ncols === 2)) {
          tcPr += "<w:tcW w:w=\"" + (ncols === 2 ? "3800" : "1600") + "\" w:type=\"pct\"/>";
        }
        tcPr += "<w:vAlign w:val=\"center\"/></w:tcPr>";
        var para = p(runsFrom(cell, isTh || tot), { spAfter: 40 });
        cells += "<w:tc>" + tcPr + para + "</w:tc>";
        first = false;
      });
      rows += "<w:tr>" + cells + "</w:tr>";
    });
    return "<w:tbl>" + tblPr(false) + grid(ncols) + rows + "</w:tbl>";
  }

  function firmasTable(el) {
    var cells = "";
    el.querySelectorAll(".firma").forEach(function (f) {
      var paras = "";
      f.childNodes.forEach(function (n) {
        if (n.nodeType === 1 && n.tagName === "P") {
          var cls = n.className || "";
          var o = {};
          if (cls.indexOf("linea") !== -1) { o.spBefore = 200; o.bold = true; }
          if (cls.indexOf("firma-firma") !== -1) { o.align = "center"; o.spBefore = 320; }
          paras += p(runsFrom(n, o.bold), o);
        }
      });
      paras += "<w:p><w:pPr><w:spacing w:after=\"0\"/></w:pPr></w:p>";
      cells += "<w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>" + paras + "</w:tc>";
    });
    return "<w:tbl>" + tblPr(false) + grid(2) + "<w:tr>" + cells + "</w:tr></w:tbl>";
  }

  function croquisXml(el) {
    var text = (el.textContent || "").replace(/\s+/g, " ").trim() || "Croquis de ubicación (completar)";
    var para = p([run(text)], { align: "center" });
    return "<w:tbl>" + tblPr(true) + grid(1) +
      "<w:tr><w:tc><w:tcPr><w:tcW w:w=\"0\" w:type=\"auto\"/></w:tcPr>" + para + "</w:tc></w:tr></w:tbl>";
  }

  function blockXml(el) {
    var tag = el.tagName;
    var cls = el.className || "";
    switch (tag) {
      case "H1": return [p(runsFrom(el), { style: "H1" })];
      case "H2": return [p(runsFrom(el), { style: "H2", border: true, spBefore: 240, spAfter: 120 })];
      case "H3": return [p(runsFrom(el), { style: "H3", spBefore: 160 })];
      case "P": {
        var o = {};
        if (cls.indexOf("c") !== -1) o.align = "center";
        if (cls.indexOf("sub") !== -1) o.style = "Sub";
        if (cls.indexOf("small") !== -1) o.style = "Small";
        if (cls.indexOf("linea") !== -1) { o.spBefore = 200; o.bold = true; }
        if (cls.indexOf("firma-firma") !== -1) { o.align = "center"; o.spBefore = 320; }
        return [p(runsFrom(el, o.bold), o)];
      }
      case "UL": {
        var items = [];
        el.childNodes.forEach(function (li) {
          if (li.nodeType === 1 && li.tagName === "LI") {
            items.push(p([run("•  ")].concat(runsFrom(li)), { indent: 360 }));
          }
        });
        return items;
      }
      case "TABLE": return [tableXml(el)];
      case "DIV":
        if (cls.indexOf("pagebreak") !== -1) return [pageBreak()];
        if (cls.indexOf("firmas") !== -1) return [firmasTable(el)];
        if (cls.indexOf("croquis") !== -1) return [croquisXml(el)];
        return walk(el);
      default: return walk(el);
    }
  }

  function walk(root) {
    var out = [];
    root.childNodes.forEach(function (node) {
      if (node.nodeType !== 1) return;
      out = out.concat(blockXml(node));
    });
    return out;
  }

  /* ---------------- Estructura OOXML ---------------- */
  function contentTypes() {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Types xmlns=\"" + CT + "\">" +
      "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>" +
      "<Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
      "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>" +
      "<Override PartName=\"/word/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml\"/>" +
      "<Override PartName=\"/word/footer1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml\"/>" +
      "</Types>";
  }

  function rootRels() {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"" + PACK + "\">" +
      "<Relationship Id=\"rId1\" Type=\"" + REL + "/officeDocument\" Target=\"word/document.xml\"/>" +
      "</Relationships>";
  }

  function docRels() {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<Relationships xmlns=\"" + PACK + "\">" +
      "<Relationship Id=\"rId1\" Type=\"" + REL + "/styles\" Target=\"styles.xml\"/>" +
      "<Relationship Id=\"rId2\" Type=\"" + REL + "/footer\" Target=\"footer1.xml\"/>" +
      "</Relationships>";
  }

  function stylesXml() {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<w:styles xmlns:w=\"" + W + "\">" +
      "<w:docDefaults>" +
      "<w:rPrDefault><w:rPr>" +
      "<w:rFonts w:ascii=\"Georgia\" w:hAnsi=\"Georgia\" w:eastAsia=\"Georgia\" w:cs=\"Georgia\"/>" +
      "<w:sz w:val=\"24\"/><w:szCs w:val=\"24\"/>" +
      "<w:lang w:val=\"es-PE\"/>" +
      "</w:rPr></w:rPrDefault>" +
      "<w:pPrDefault><w:pPr><w:spacing w:after=\"120\" w:line=\"276\" w:lineRule=\"auto\"/></w:pPr></w:pPrDefault>" +
      "</w:docDefaults>" +
      "<w:style w:type=\"paragraph\" w:default=\"1\" w:styleId=\"Normal\"><w:name w:val=\"Normal\"/></w:style>" +
      "<w:style w:type=\"paragraph\" w:styleId=\"H1\">" +
      "<w:name w:val=\"Heading 1\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/>" +
      "<w:pPr><w:spacing w:before=\"360\" w:after=\"120\"/><w:jc w:val=\"center\"/></w:pPr>" +
      "<w:rPr><w:b/><w:sz w:val=\"52\"/><w:szCs w:val=\"52\"/></w:rPr>" +
      "</w:style>" +
      "<w:style w:type=\"paragraph\" w:styleId=\"H2\">" +
      "<w:name w:val=\"Heading 2\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/>" +
      "<w:pPr><w:spacing w:before=\"240\" w:after=\"120\"/>" +
      "<w:pBdr><w:bottom w:val=\"single\" w:sz=\"12\" w:space=\"1\" w:color=\"000000\"/></w:pBdr></w:pPr>" +
      "<w:rPr><w:b/><w:sz w:val=\"32\"/><w:szCs w:val=\"32\"/></w:rPr>" +
      "</w:style>" +
      "<w:style w:type=\"paragraph\" w:styleId=\"H3\">" +
      "<w:name w:val=\"Heading 3\"/><w:basedOn w:val=\"Normal\"/><w:qFormat/>" +
      "<w:pPr><w:spacing w:before=\"160\" w:after=\"60\"/></w:pPr>" +
      "<w:rPr><w:b/><w:sz w:val=\"26\"/><w:szCs w:val=\"26\"/></w:rPr>" +
      "</w:style>" +
      "<w:style w:type=\"paragraph\" w:styleId=\"Sub\">" +
      "<w:name w:val=\"Subtitle\"/><w:basedOn w:val=\"Normal\"/>" +
      "<w:rPr><w:i/><w:color w:val=\"555555\"/></w:rPr>" +
      "</w:style>" +
      "<w:style w:type=\"paragraph\" w:styleId=\"Small\">" +
      "<w:name w:val=\"Small Text\"/><w:basedOn w:val=\"Normal\"/>" +
      "<w:rPr><w:sz w:val=\"20\"/><w:szCs w:val=\"20\"/><w:color w:val=\"555555\"/></w:rPr>" +
      "</w:style>" +
      "</w:styles>";
  }

  function footerXml() {
    var r = function (t) {
      return "<w:r><w:rPr><w:sz w:val=\"18\"/><w:szCs w:val=\"18\"/><w:color w:val=\"666666\"/></w:rPr>" +
        "<w:t xml:space=\"preserve\">" + xml(t) + "</w:t></w:r>";
    };
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<w:ftr xmlns:w=\"" + W + "\">" +
      "<w:p><w:pPr><w:jc w:val=\"center\"/></w:pPr>" +
      r("TASADOR PERÚ · Informe de Tasación · Página ") +
      "<w:r><w:rPr><w:sz w:val=\"18\"/></w:rPr><w:fldChar w:fldCharType=\"begin\"/></w:r>" +
      "<w:r><w:rPr><w:sz w:val=\"18\"/></w:rPr><w:instrText xml:space=\"preserve\"> PAGE </w:instrText></w:r>" +
      "<w:r><w:rPr><w:sz w:val=\"18\"/></w:rPr><w:fldChar w:fldCharType=\"end\"/></w:r>" +
      "</w:p></w:ftr>";
  }

  function documentXml(bodyXml) {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" +
      "<w:document xmlns:w=\"" + W + "\" xmlns:r=\"" + REL + "\">" +
      "<w:body>" + bodyXml +
      "<w:sectPr>" +
      "<w:footerReference w:type=\"default\" r:id=\"rId2\"/>" +
      "<w:pgSz w:w=\"11906\" w:h=\"16838\"/>" +
      "<w:pgMar w:top=\"1020\" w:right=\"907\" w:bottom=\"1134\" w:left=\"907\" w:header=\"567\" w:footer=\"567\"/>" +
      "<w:pgNumType w:start=\"1\"/>" +
      "</w:sectPr>" +
      "</w:body></w:document>";
  }

  /* ---------------- ZIP (STORE) ---------------- */
  function makeZip(files) {
    var enc = new TextEncoder();
    var crcT = [];
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcT[i] = c >>> 0;
    }
    function crc32(bytes) {
      var c = 0xFFFFFFFF;
      for (var j = 0; j < bytes.length; j++) c = crcT[(c ^ bytes[j]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }

    var data = [];
    var central = [];
    var offset = 0;
    files.forEach(function (f) {
      var bytes = enc.encode(f.data);
      var name = enc.encode(f.name);
      var crc = crc32(bytes);
      var localLen = 30 + name.length;
      var csize = bytes.length;

      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, csize, true);
      lh.setUint32(22, csize, true); lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      data.push(lh.buffer, name, bytes);

      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0, true);
      ch.setUint16(14, 0, true); ch.setUint32(16, crc, true); ch.setUint32(20, csize, true);
      ch.setUint32(24, csize, true);       ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += localLen + csize;
    });

    var cdOffset = offset;
    var cdSize = 0;
    central.forEach(function (p) { cdSize += p.byteLength; });

    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true);
    end.setUint32(16, cdOffset, true);

    var flat = data.concat(central);
    flat.push(end.buffer);
    return new Blob(flat, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  /* ---------------- API ---------------- */
  function generateWordDoc(rootEl) {
    var bodyXml = walk(rootEl).join("");
    var files = [
      { name: "[Content_Types].xml", data: contentTypes() },
      { name: "_rels/.rels", data: rootRels() },
      { name: "word/document.xml", data: documentXml(bodyXml) },
      { name: "word/_rels/document.xml.rels", data: docRels() },
      { name: "word/styles.xml", data: stylesXml() },
      { name: "word/footer1.xml", data: footerXml() }
    ];
    return makeZip(files);
  }

  function saveAs(blob, filename) {
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
  }

  window.generateWordDoc = generateWordDoc;
  window.saveAs = saveAs;
})();
