export interface XmlElement {
    name: string;
    namespace: string;
    attributes: Record<string, string>;
    children: XmlElement[];
    text: string;
}
/** Deliberately limited XML 1.0 subset for CAS; no DTDs or external entity resolution. */
export declare function parseXml(input: string): XmlElement;
