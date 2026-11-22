import { messageFileAttachment, messageFilePath } from '../message-file-attachment.js';
const cardSelector = '[data-message-attachments] > span[title]';
const actionable = 'data-dsh-remote-message-file';
function fileAddress(card, conversation) {
    const sessionId = card.closest('[data-conversation-session]')?.getAttribute('data-conversation-session');
    const nodeKey = card.closest('[data-chat-node-key]')?.getAttribute('data-chat-node-key');
    if (!sessionId || !nodeKey || !card.parentElement)
        return;
    let node;
    try {
        node = conversation.binding(sessionId).target('chat').getSnapshot()?.nodes.get(nodeKey);
    }
    catch {
        // Virtualized rows can outlive the binding briefly during navigation.
        return;
    }
    if ((node?.kind !== 'user' && node?.kind !== 'steering') || !Array.isArray(node.data.content))
        return;
    const attachments = node.data.content.map(messageFileAttachment).filter(ref => ref !== undefined);
    const cards = Array.from(card.parentElement.querySelectorAll(':scope > span[title]'));
    if (cards.length !== attachments.length)
        return;
    const ref = attachments[cards.indexOf(card)];
    if (ref === undefined || ref.name !== card.getAttribute('title'))
        return;
    const path = messageFilePath(ref).split('/').map(encodeURIComponent).join('/');
    return `dsh-resource://file/session/${encodeURIComponent(sessionId)}/${path}`;
}
/** Use the native chat cards and Sidebar; the public Chat snapshot identifies each card's durable attachment. */
export function installMessageFilePreview(feed, conversation, sidebar) {
    let active = false;
    const refresh = () => {
        for (const card of Array.from(document.querySelectorAll(`${cardSelector}, [${actionable}]`))) {
            const enabled = active && card.matches(cardSelector) && fileAddress(card, conversation) !== undefined;
            if (enabled && !card.hasAttribute(actionable)) {
                card.setAttribute(actionable, '');
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
            }
            else if (!enabled && card.hasAttribute(actionable)) {
                card.removeAttribute(actionable);
                card.removeAttribute('role');
                card.removeAttribute('tabindex');
            }
        }
    };
    const observer = new MutationObserver(refresh);
    const unsubscribe = feed.subscribe(status => {
        const enabled = status.mode === 'remote' && status.connected === true && status.backend === 'harness';
        if (enabled === active)
            return;
        active = enabled;
        if (active)
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-chat-node-key', 'data-conversation-session', 'title'],
            });
        else
            observer.disconnect();
        refresh();
    });
    const open = (event) => {
        if (!active || !(event.target instanceof Element))
            return;
        if (event instanceof KeyboardEvent && (event.repeat || (event.key !== 'Enter' && event.key !== ' ')))
            return;
        const card = event.target.closest(cardSelector);
        const address = card === null ? undefined : fileAddress(card, conversation);
        if (address === undefined)
            return;
        event.preventDefault();
        sidebar.openResource(address);
    };
    document.addEventListener('click', open);
    document.addEventListener('keydown', open);
    return () => {
        unsubscribe();
        observer.disconnect();
        active = false;
        refresh();
        document.removeEventListener('click', open);
        document.removeEventListener('keydown', open);
    };
}
//# sourceMappingURL=message-file-preview.js.map