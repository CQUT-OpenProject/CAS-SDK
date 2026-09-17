import { CasError } from "../errors/cas-error.js";

export interface XmlElement {
  name: string;
  namespace: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

function invalid(): never {
  throw new CasError("VALIDATION_FAILED", "Invalid or unsupported CAS XML structure");
}
const XML_NS = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";
const namePattern = /^[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?/;
function validChar(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 32 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}
function decode(text: string): string {
  let result = "";
  for (let i = 0; i < text.length;) {
    if (text[i] !== "&") {
      result += text[i++];
      continue;
    }
    const end = text.indexOf(";", i);
    if (end < 0) invalid();
    const entity = text.slice(i + 1, end);
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", apos: "'", quot: '"' };
    if (Object.hasOwn(predefined, entity)) result += predefined[entity];
    else {
      if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/.test(entity)) invalid();
      const code = entity.startsWith("#x")
        ? parseInt(entity.slice(2), 16)
        : Number(entity.slice(1));
      if (!validChar(code)) invalid();
      result += String.fromCodePoint(code);
    }
    i = end + 1;
  }
  return result;
}

/** Deliberately limited XML 1.0 subset for CAS; no DTDs or external entity resolution. */
export function parseXml(input: string): XmlElement {
  const xml = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (const char of xml) if (!validChar(char.codePointAt(0)!)) invalid();
  let pos = 0;
  let root: XmlElement | undefined;
  const stack: Array<{ node: XmlElement; qname: string; namespaces: Record<string, string> }> = [];
  const whitespace = () => {
    const start = pos;
    while (/[\t\n\r ]/.test(xml[pos] ?? "") && pos < xml.length) pos++;
    return pos > start;
  };
  const name = () => {
    const value = xml.slice(pos).match(namePattern)?.[0];
    if (!value) invalid();
    pos += value.length;
    return value;
  };
  if (xml.startsWith("<?xml")) {
    const declaration = xml.match(
      /^<\?xml\s+version\s*=\s*(?:"1\.0"|'1\.0')(?:\s+encoding\s*=\s*(?:"[Uu][Tt][Ff]-8"|'[Uu][Tt][Ff]-8'))?(?:\s+standalone\s*=\s*(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>/,
    )?.[0];
    if (!declaration || !declaration.startsWith("<?xml")) invalid();
    pos = declaration.length;
  }
  while (pos < xml.length) {
    const parent = stack.at(-1);
    if (xml.startsWith("<!--", pos)) {
      const end = xml.indexOf("-->", pos + 4);
      const comment = xml.slice(pos + 4, end);
      if (end < 0 || comment.includes("--") || comment.endsWith("-")) invalid();
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", pos)) {
      const end = xml.indexOf("]]>", pos + 9);
      if (!parent || end < 0) invalid();
      parent.node.text += xml.slice(pos + 9, end);
      pos = end + 3;
      continue;
    }
    if (xml.startsWith("</", pos)) {
      pos += 2;
      const closing = name();
      whitespace();
      if (xml[pos++] !== ">" || !parent || closing !== parent.qname) invalid();
      stack.pop();
      continue;
    }
    if (xml[pos] !== "<") {
      let end = xml.indexOf("<", pos);
      if (end < 0) end = xml.length;
      const raw = xml.slice(pos, end);
      if (raw.includes("]]>")) invalid();
      if (parent) parent.node.text += decode(raw);
      else if (!/^[\t\n\r ]*$/.test(raw)) invalid();
      pos = end;
      continue;
    }
    if (xml.startsWith("<!", pos) || xml.startsWith("<?", pos)) invalid();
    pos++;
    const qname = name();
    const attributes: Record<string, string> = Object.create(null);
    let separated = whitespace();
    while (xml[pos] !== ">" && !xml.startsWith("/>", pos)) {
      if (!separated || pos >= xml.length) invalid();
      const key = name();
      whitespace();
      if (xml[pos++] !== "=") invalid();
      whitespace();
      const quote = xml[pos++];
      if (quote !== '"' && quote !== "'") invalid();
      const end = xml.indexOf(quote, pos);
      if (end < 0 || Object.hasOwn(attributes, key)) invalid();
      const raw = xml.slice(pos, end);
      if (raw.includes("<")) invalid();
      attributes[key] = decode(raw.replace(/[\t\n\r]/g, " "));
      pos = end + 1;
      separated = whitespace();
    }
    const namespaces: Record<string, string> = Object.assign(
      Object.create(null),
      parent?.namespaces ?? { xml: XML_NS },
    );
    for (const [key, value] of Object.entries(attributes)) {
      if (key === "xmlns") {
        if (value === XML_NS || value === XMLNS_NS) invalid();
        namespaces[""] = value;
      } else if (key.startsWith("xmlns:")) {
        const prefix = key.slice(6);
        if (
          !value ||
          prefix === "xmlns" ||
          value === XMLNS_NS ||
          (prefix === "xml" ? value !== XML_NS : value === XML_NS)
        )
          invalid();
        namespaces[prefix] = value;
      }
    }
    const expanded = (qualified: string, attribute = false): [string, string] => {
      const parts = qualified.split(":");
      if (parts.length === 1) return [qualified, attribute ? "" : (namespaces[""] ?? "")];
      const prefix = parts[0]!;
      const ns = namespaces[prefix];
      if (!ns || prefix === "xmlns") invalid();
      return [parts[1]!, ns];
    };
    const [localName, namespace] = expanded(qname);
    const seen = new Set<string>();
    for (const key of Object.keys(attributes)) {
      if (key === "xmlns" || key.startsWith("xmlns:")) continue;
      const [local, ns] = expanded(key, true);
      const id = `${ns}\0${local}`;
      if (seen.has(id)) invalid();
      seen.add(id);
    }
    const node: XmlElement = { name: localName, namespace, attributes, children: [], text: "" };
    if (parent) parent.node.children.push(node);
    else {
      if (root) invalid();
      root = node;
    }
    if (xml.startsWith("/>", pos)) pos += 2;
    else {
      pos++;
      stack.push({ node, qname, namespaces });
    }
  }
  if (!root || stack.length) invalid();
  return root;
}
