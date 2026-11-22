import type { StatusFeed } from '../status-stream.js';
import type { RemoteStatus } from './types.js';
export interface MessageFileConversation {
    binding(sessionId: string): {
        target(name: 'chat'): {
            getSnapshot(): {
                nodes: {
                    get(key: string): {
                        kind: string;
                        data: {
                            content?: readonly unknown[];
                        };
                    } | undefined;
                };
            } | undefined;
        };
    };
}
export interface MessageFileSidebar {
    openResource(address: string): void;
}
/** Use the native chat cards and Sidebar; the public Chat snapshot identifies each card's durable attachment. */
export declare function installMessageFilePreview(feed: StatusFeed<RemoteStatus>, conversation: MessageFileConversation, sidebar: MessageFileSidebar): () => void;
//# sourceMappingURL=message-file-preview.d.ts.map