const TEXT_ATTRIBUTES = ['aria-label', 'alt', 'placeholder', 'title'];

const PLAYFUL_WORDS = Object.freeze({
  crawl: 'cwawl',
  crawled: 'cwawled',
  crawling: 'cwawling',
  crawls: 'cwawls',
  progress: 'pwogwess',
  rabbit: 'wabbit',
  ready: 'weady',
  strong: 'stwong',
  very: 'vewy',
  workout: 'wowkout',
  workouts: 'wowkouts',
});

const PLAYFUL_WORD_PATTERN = /\b(crawl|crawled|crawling|crawls|progress|rabbit|ready|strong|very|workout|workouts)\b/gi;

function matchCase(source, replacement) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export const swapRs = (value) => String(value).replace(PLAYFUL_WORD_PATTERN, (word) => (
  matchCase(word, PLAYFUL_WORDS[word.toLowerCase()])
));

function transformTextNode(node) {
  const transformed = swapRs(node.nodeValue);
  if (transformed !== node.nodeValue) node.nodeValue = transformed;
}

function transformAttributes(element) {
  TEXT_ATTRIBUTES.forEach((name) => {
    if (!element.hasAttribute(name)) return;
    const current = element.getAttribute(name);
    const transformed = swapRs(current);
    if (transformed !== current) element.setAttribute(name, transformed);
  });
}

function transformTree(root, documentRef) {
  if (root.nodeType === 3) {
    transformTextNode(root);
    return;
  }

  if (root.nodeType === 1) transformAttributes(root);

  const walker = documentRef.createTreeWalker(root, 4);
  while (walker.nextNode()) transformTextNode(walker.currentNode);

  root.querySelectorAll?.('*').forEach(transformAttributes);
}

export function enableWSpeech(root = document) {
  const documentRef = root.nodeType === 9 ? root : root.ownerDocument;
  const scope = root.nodeType === 9 ? root.body : root;
  if (!documentRef || !scope || documentRef.documentElement.dataset.wSpeech === 'enabled') return null;

  documentRef.documentElement.dataset.wSpeech = 'enabled';
  documentRef.title = swapRs(documentRef.title);

  const description = documentRef.querySelector('meta[name="description"]');
  if (description) description.content = swapRs(description.content);

  transformTree(scope, documentRef);

  const observer = new documentRef.defaultView.MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'characterData') transformTextNode(mutation.target);
      if (mutation.type === 'attributes') transformAttributes(mutation.target);
      mutation.addedNodes?.forEach((node) => transformTree(node, documentRef));
    });
  });

  observer.observe(scope, {
    attributes: true,
    attributeFilter: TEXT_ATTRIBUTES,
    characterData: true,
    childList: true,
    subtree: true,
  });

  return observer;
}
