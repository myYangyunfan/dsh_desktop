/**
 * The anchored-popover CONTENTS of the Tasks page (geometry and dismissal
 * live in AnchoredPopover): the agent node detail with a transcript jump and
 * the workflow run detail with clickable member rows. Both share one grammar:
 * a letter-spaced uppercase head, a dt/dd key/value grid, a titled well and
 * one full-width jump action.
 *
 * The two cards are ONE skeleton: the same head band, the same [glyph][title]
 * title row (the card's own host glyph, never a typed character), the same
 * inset list well of 28px rows, and one l1 hairline around whatever closes the
 * card. The only intended difference is where a group header sits: a single
 * list keeps its label fixed above the well, while a multi-phase run scrolls
 * each phase label with its own rows.
 *
 * Every control is a host primitive (`Button` / `StateDot` / `Tag`) — a row
 * that opens something IS a `<button>`, so it is keyboard reachable — and the
 * boxes around them are the page's own module classes (`popCard`, `popRows`,
 * `popList*`). The card is the portal's content root, so it paints the floating
 * surface itself: the popover shell only positions the box it portals.
 *
 * A member row with a child session jumps to that transcript; a member without
 * one (a declaration that never spawned) stays a plain tally line.
 *
 * The team board is NOT here: it is always visible as a strip above the
 * canvas (TeamBoard.tsx).
 */
import type { ReactNode } from 'react';
import type { SidebarSubagentAddress } from '../context-types.ts';
import type { TasksAgentNode, TasksWorkflowNode } from './tasks-model.ts';
/** The agent node detail popover. */
export declare function AgentNodePopover(props: {
    node: TasksAgentNode;
    onJump(node: TasksAgentNode): void;
    /** Open the shared task window for one of the node's tasks. */
    onOpenTask(taskId: string, anchor: HTMLElement): void;
}): ReactNode;
/** The workflow run detail popover (phases with clickable member rows). */
export declare function WorkflowNodePopover(props: {
    node: TasksWorkflowNode;
    onJumpMember(address: SidebarSubagentAddress): void;
}): ReactNode;
