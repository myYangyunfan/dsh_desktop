/** Copy dictionaries for the shop's page in dsh's main column, its row in the
 * sidebar, and its two buttons on dsh's Plugins page. */
/** Simplified Chinese dictionary and key source of truth. */
export declare const zh: {
    /** The shop's name: its sidebar row and its page title (design
     * 2026-10-16-shop-sidebar-page §4.1), one key so the two cannot drift
     * apart. */
    title: string;
    /** The page's intro line, under its title, as dsh's own pages carry one. */
    intro: string;
    /** The Plugins page's button on the shop's own bundle page (design
     * 2026-10-16-shop-sidebar-page §7). */
    openShop: string;
    /** Its button on a page of a bundle the shelf lists. */
    viewInShop: string;
    loading: string;
    error: string;
    installedLoading: string;
    installedError: string;
    retry: string;
    /** The shop's own error boundary caught a render error; the error's message
     * follows on its own line, and Retry remounts the tab (design
     * 2026-09-26-market-borrowings §4). */
    tabCrashed: string;
    search: string;
    /** One subdued line under the search box when a Chinese query fired a
     * dictionary intent (design 2026-10-08-search-query-expansion §4).
     * `{terms}` is the comma-joined recall terms, without the `#` marker
     * (boundary-only surface detail, not a reader's fact). */
    zhExpansionNote: string;
    all: string;
    catalog: string;
    catalogStats: string;
    /** The shelf's order control, and the date each card carries under the two
     * date orders (design 2026-10-12-shelf-orders §4). */
    sortLabel: string;
    /** The wide layout's rail headings (design 2026-11-02-shop-widescreen-layout
     * §4): the category group above, the hide-incompatible modifier below. */
    categoriesHeading: string;
    filterHeading: string;
    sortStars: string;
    sortAdded: string;
    sortUpdated: string;
    listedOn: string;
    updatedOn: string;
    stars: string;
    categoryTool: string;
    categoryProvider: string;
    categoryUi: string;
    categoryWorkflow: string;
    categoryIntegration: string;
    categoryTheme: string;
    categoryOther: string;
    empty: string;
    emptySearch: string;
    tierVerified: string;
    tierVerifiedStale: string;
    tierCommunity: string;
    /** The github repository GitHub reports as archived (design 2026-10-08 §1.3).
     * Subdued register, like `tierCommunity`: nothing is wrong with the install
     * itself; the owner has simply frozen the project. */
    archivedBadge: string;
    capabilitiesNote: string;
    install: string;
    cancel: string;
    dismiss: string;
    /** The copy button beside a failed install's command line (design
     * 2026-11-02-market-borrowings §5). `copied` replaces it only after the
     * clipboard write resolved, so it is never claimed early. */
    copyCommand: string;
    copied: string;
    /** The fold toggle under a card's collapsed red block. `aria-expanded` plus:
     * open shows the whole block; closed shows two lines of it. This toggle is
     * independent of the card's own header-expand. */
    moreRedLines: string;
    lessRedLines: string;
    installing: string;
    downloading: string;
    installedRestartNotice: string;
    incompatibleBadge: string;
    incompatibleDetail: string;
    /** The author's own `dsh.compatibility`, unmet on this machine (design
     * 2026-09-01 §8.2). Each names BOTH sides — what the author declared and
     * what this dsh runs — because the host sends both, and a bare
     * "unsupported" leaves the reader guessing which side is off. */
    harnessRangeDetail: string;
    harnessProfileDetail: string;
    /** dsh's OWN refusal (0.1.7 on), not the author's claim: the card shows the
     * refused label in the install button's place (design
     * 2026-09-26-dsh-017-readiness, B1, amended 2026-10-14). `{peers}`
     * is each refused peer with the range the package declared. The remedy
     * leads into the exemption command, rendered on its own line after it, and
     * names the Refresh button by its label. */
    harnessPeersDetail: string;
    harnessPeersRemedy: string;
    hotNoPatchNotice: string;
    hotNotSimpleNotice: string;
    hotHostUnsupportedNotice: string;
    hotTimeoutNotice: string;
    hotMountFailedNotice: string;
    /** No mount was tried: this dsh already loaded the package once, and Node
     * will not load a second copy from the same place (design
     * 2026-09-26-market-borrowings §1). Covers an update and a reinstall alike,
     * so it names the new files rather than a "new version". */
    hotAlreadyLoadedNotice: string;
    installedNoRestartNotice: string;
    installedReloadNotice: string;
    reload: string;
    reloadNote: string;
    installFailed: string;
    installTransportFailed: string;
    refresh: string;
    refreshing: string;
    refreshFailed: string;
    staleLabel: string;
    showing: string;
    repository: string;
    npmPage: string;
    authorLine: string;
    /** The accessible name and tooltip of the size label; the label itself shows
     * the bare figure. "磁盘占用" is the load-bearing phrase — the number is what
     * the install lands on disk, not the download. It replaced "解包后", which
     * was npm's word: a commit-pinned github entry unpacks nothing, its figure
     * being the sum of its git tree's blobs. One phrase now covers both sources
     * and stays true of npm, whose number is unchanged. */
    sizeLabel: string;
    /** The incompatible filter's label. FIXED — the switch beside it carries the
     * state, so the words name what the switch does and never flip with it. */
    hideIncompatible: string;
    /** The favorites switch (design 2026-11-02-market-borrowings §7), fixed for
     * the same reason `hideIncompatible` is: the switch carries the state. */
    favoritesFilter: string;
    favoritesFilterTitle: string;
    emptyFavoritesFiltered: string;
    /** What the filter takes away is every card whose badge reads 不兼容 —
     * missing components OR an author's declaration this dsh does not meet —
     * so these three name the badge, not one of its reasons. */
    incompatibleFilterTitle: string;
    showIncompatibleTitle: string;
    emptyIncompatibleFiltered: string;
    license: string;
    customLicense: string;
    /** The prepurchase facts' detail rows (design 2026-11-02-market-borrowings
     * §1–§2). `requiresDsh` names the field as dsh's own refusal names it — a
     * manifest path, not a package — and the row prints the range the author
     * wrote, verbatim. */
    requiresDsh: string;
    dependencies: string;
    commands: string;
    /** The install-scripts row (design 2026-11-04-borrowings-round-4 §2). The
     * second line states what pnpm does with it, so the fact is not read as a
     * verdict on the script. */
    installScripts: string;
    /** The failure report's prefilled issue (design 2026-11-05-failure-report.md). */
    reportProblem: string;
    installScriptsDeclared: string;
    /** The size label's tooltip for an install that lands more than 50 MB on
     * disk. The figure is already large on screen; this phrase says why it is
     * tinted, without inventing a threshold nobody measured — 50 MB is the
     * figure the competitor's own users proposed. */
    sizeLabelLarge: string;
    reviewedVersionLine: string;
    reviewedPinLine: string;
    deniedCode: string;
    notInCatalogCode: string;
    versionMismatchCode: string;
    needsAcknowledgementCode: string;
    tarballIntegrityCode: string;
    ambiguousIdentityCode: string;
    nameTakenCode: string;
    desktopProfileCode: string;
    nameTakenBadge: string;
    nameTakenDetail: string;
    npmSource: string;
    githubSource: string;
    /** The accessible name and the tooltip of a card's version, which say which
     * of three things the printed string is (market borrowings §11): the string
     * alone cannot tell a release tag from a version number, and a short commit
     * printed with a `v` read as one. */
    npmVersionLabel: string;
    commitVersionLabel: string;
    releaseVersionLabel: string;
    /** The badge and the explanation for an installed github entry no catalog
     * row claims (C10 MVP). The mechanism synthesizes a row for ANY github spec
     * with no catalog row — shadowed by a same-named npm package, an unlisted
     * fork, a removed listing, or a same-named conflict with a different repo —
     * so the copy names the catalog fact and lists the causes, rather than
     * claiming the npm-twin one. */
    shadowedBadge: string;
    shadowedDetail: string;
    updatableSection: string;
    /** `{version}` is the shelf's own version text (`versionLabel`), which
     * carries the `v` an npm version takes and no other kind does. */
    installedVersion: string;
    latestVersion: string;
    /** The rollback offer on an installed card (design
     * 2026-11-02-market-borrowings §6). `{version}` is the version the record
     * names, formatted by `versionLabel` before it gets here. */
    /** The star's accessible name and tooltip (design 2026-11-02-market-borrowings
     * §7). A fixed pair: the visible glyph is the same in both states, so the
     * label names the action, and `aria-pressed` carries the state. */
    favorite: string;
    unfavorite: string;
    rollbackTo: string;
    rollingBack: string;
    rollbackFailed: string;
    /** The update row's link to what the new version changed (design
     * 2026-11-02-market-borrowings §4): the npm page of the target version, the
     * GitHub compare view, or the repository's releases. */
    whatChanged: string;
    update: string;
    /** The Updatable section's one batch action (design
     * 2026-11-04-borrowings-round-4 §3). `{count}` is the rows it will start. */
    updateAll: string;
    installed: string;
    uninstall: string;
    uninstalling: string;
    uninstallFailed: string;
    uninstallTransportFailed: string;
    uninstalledLiveNotice: string;
    uninstalledRestartNotice: string;
    uninstalledReloadNotice: string;
    restart: string;
    restartTitle: string;
    restartBody: string;
    restartConfirm: string;
    restarting: string;
    restartFailedNotice: string;
    /** The same failure, when the host said where the new process writes —
     * which is where a boot that died explains itself (design
     * 2026-09-26-market-borrowings §3). "Or did not stay up": the page now
     * waits for the new server to keep answering, so this also covers a boot
     * that answered and then died. */
    restartFailedLogNotice: string;
    restartTransportFailed: string;
    notRestartedNotice: string;
    notRestartedPidNotice: string;
    notRestartedLogNotice: string;
    restartBlockedDesktopNotice: string;
    restartBlockedFromDefaultProfileNotice: string;
    restartBlockedWindowsNotice: string;
    restartBlockedSystemdNotice: string;
    restartBlockedPortZeroNotice: string;
    updateFailed: string;
    updateTransportFailed: string;
    checkUpdate: string;
    checkUpdateTitle: string;
    updateInDshPage: string;
    updateInDshPageTitle: string;
    upToDate: string;
    github: string;
    enabledSwitch: string;
    toggleFailed: string;
    hotApplyNote: string;
    toggleRestartNote: string;
};
/** Shop locale key union. */
export type ShopLocaleKey = keyof typeof zh;
/** English dictionary checked against the Chinese key set. */
export declare const en: {
    title: string;
    intro: string;
    openShop: string;
    viewInShop: string;
    loading: string;
    error: string;
    installedLoading: string;
    installedError: string;
    retry: string;
    tabCrashed: string;
    search: string;
    /** One subdued line under the search box when a Chinese query fired a
     * dictionary intent (design 2026-10-08-search-query-expansion §4). */
    zhExpansionNote: string;
    all: string;
    catalog: string;
    catalogStats: string;
    /** The shelf's order control, and the date each card carries under the two
     * date orders (design 2026-10-12-shelf-orders §4). */
    sortLabel: string;
    /** The wide layout's rail headings (design 2026-11-02-shop-widescreen-layout
     * §4): the category group above, the hide-incompatible modifier below. */
    categoriesHeading: string;
    filterHeading: string;
    sortStars: string;
    sortAdded: string;
    sortUpdated: string;
    listedOn: string;
    updatedOn: string;
    stars: string;
    categoryTool: string;
    categoryProvider: string;
    categoryUi: string;
    categoryWorkflow: string;
    categoryIntegration: string;
    categoryTheme: string;
    categoryOther: string;
    empty: string;
    emptySearch: string;
    tierVerified: string;
    /** The github repository GitHub reports as archived (design 2026-10-08 §1.3).
     * Subdued register: nothing is wrong with the install; the owner has simply
     * frozen the project. */
    archivedBadge: string;
    tierVerifiedStale: string;
    tierCommunity: string;
    capabilitiesNote: string;
    install: string;
    cancel: string;
    dismiss: string;
    copyCommand: string;
    copied: string;
    moreRedLines: string;
    lessRedLines: string;
    installing: string;
    downloading: string;
    installedRestartNotice: string;
    incompatibleBadge: string;
    incompatibleDetail: string;
    harnessRangeDetail: string;
    harnessProfileDetail: string;
    harnessPeersDetail: string;
    harnessPeersRemedy: string;
    hotNoPatchNotice: string;
    hotNotSimpleNotice: string;
    hotHostUnsupportedNotice: string;
    hotTimeoutNotice: string;
    hotMountFailedNotice: string;
    hotAlreadyLoadedNotice: string;
    installedNoRestartNotice: string;
    installedReloadNotice: string;
    reload: string;
    reloadNote: string;
    installFailed: string;
    installTransportFailed: string;
    refresh: string;
    refreshing: string;
    refreshFailed: string;
    staleLabel: string;
    showing: string;
    repository: string;
    npmPage: string;
    authorLine: string;
    sizeLabel: string;
    hideIncompatible: string;
    favoritesFilter: string;
    favoritesFilterTitle: string;
    emptyFavoritesFiltered: string;
    incompatibleFilterTitle: string;
    showIncompatibleTitle: string;
    emptyIncompatibleFiltered: string;
    license: string;
    customLicense: string;
    requiresDsh: string;
    dependencies: string;
    commands: string;
    installScripts: string;
    reportProblem: string;
    installScriptsDeclared: string;
    sizeLabelLarge: string;
    reviewedVersionLine: string;
    reviewedPinLine: string;
    deniedCode: string;
    notInCatalogCode: string;
    versionMismatchCode: string;
    needsAcknowledgementCode: string;
    tarballIntegrityCode: string;
    ambiguousIdentityCode: string;
    nameTakenCode: string;
    desktopProfileCode: string;
    nameTakenBadge: string;
    nameTakenDetail: string;
    npmSource: string;
    githubSource: string;
    npmVersionLabel: string;
    commitVersionLabel: string;
    releaseVersionLabel: string;
    shadowedBadge: string;
    shadowedDetail: string;
    updatableSection: string;
    installedVersion: string;
    latestVersion: string;
    favorite: string;
    unfavorite: string;
    rollbackTo: string;
    rollingBack: string;
    rollbackFailed: string;
    whatChanged: string;
    update: string;
    updateAll: string;
    installed: string;
    uninstall: string;
    uninstalling: string;
    uninstallFailed: string;
    uninstallTransportFailed: string;
    uninstalledLiveNotice: string;
    uninstalledRestartNotice: string;
    uninstalledReloadNotice: string;
    restart: string;
    restartTitle: string;
    restartBody: string;
    restartConfirm: string;
    restarting: string;
    restartFailedNotice: string;
    restartFailedLogNotice: string;
    restartTransportFailed: string;
    notRestartedNotice: string;
    notRestartedPidNotice: string;
    notRestartedLogNotice: string;
    restartBlockedDesktopNotice: string;
    restartBlockedFromDefaultProfileNotice: string;
    restartBlockedWindowsNotice: string;
    restartBlockedSystemdNotice: string;
    restartBlockedPortZeroNotice: string;
    updateFailed: string;
    updateTransportFailed: string;
    checkUpdate: string;
    checkUpdateTitle: string;
    updateInDshPage: string;
    updateInDshPageTitle: string;
    upToDate: string;
    github: string;
    enabledSwitch: string;
    toggleFailed: string;
    hotApplyNote: string;
    toggleRestartNote: string;
};
