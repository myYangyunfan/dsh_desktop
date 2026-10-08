import type { Context, SidebarSessionList } from '../../context-types.ts';
import type { SidebarStore } from '../state.ts';
export declare function useHostFeeds(feeds: {
    ctx: Context;
    store: SidebarStore;
    sessionList: SidebarSessionList;
    sessionId: string | undefined;
}): {
    subagentJumpRef: {
        current: string | undefined;
    };
};
