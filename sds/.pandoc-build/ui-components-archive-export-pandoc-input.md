---
title: "Ui Components Archive Export"
lang: en-US
---

## 8.5.2 Archive and export module

**Purpose:**

Enable operators to browse, filter, and export archived studies, open a selected study in the case viewer for review, and monitor export progress to PACS or an external disk until handoff completes.

**Software Requirements:**

- The software shall block the main archive body behind a clear loading state until a local archive readiness check succeeds, then reveal the study catalog and export affordances.
- The software shall keep an archive-oriented realtime channel connected for study lifecycle, disk, USB, and export events while the operator remains on archive-related routes.
- The software shall let the operator sort, search, and filter the archived study catalog, manage selection and bulk actions from the control region, and open export destination choice before continuing on PACS or USB routes.
- The software shall let the operator browse, bookmark, import, view reports, and delete studies from the archive list with confirmation and safeguards when exports are in flight.
- The software shall open the case viewer for the chosen archived study when the operator activates Open Study on a list row, so they can review that case outside the archive catalog.
- The software shall let the operator configure a default PACS server, verify connectivity, and submit model-video DICOM export for studies carried from the archive.
- The software shall let the operator choose a writable USB device, adjust export formats and anonymisation, and submit external-disk export for studies carried from the archive.
- The software shall present a bottom export status strip when jobs exist, grouped by destination, with expand, stop, dismiss, and troubleshooting paths on the archive, PACS, and USB routes.
- The software shall merge export jobs returned from PACS or USB submission into that strip once, then clear transient navigation state so repeat visits do not duplicate rows.
- The software shall abort in-flight archive study list requests when controlling inputs change or the surface unmounts so stale pages are not applied late.

**Module Structure:**

This module consists of the following software units:

• Unit 8.5.2.a: Archive container
• Unit 8.5.2.b: Archive list
• Unit 8.5.2.c: PACS export
• Unit 8.5.2.d: USB export
• Unit 8.5.2.e: Export status bar

*Other UI modules: documented in separate SDS excerpts (TBD).*

### 8.5.2.a Archive container

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that gates the archive route behind readiness polling, orchestrates study retrieval and disk context, hosts the control region and export-case modal, coordinates deletion and filter flows, opens the case viewer from list Open Study actions, and composes the archive list with the export status strip.

**Software Requirements:**

- The software shall show a full-screen blocking overlay with progress messaging until archive readiness polling succeeds, then render the archive catalog and export strip.
- The software shall load the archived study list with search, sort, and applied filters using abortable requests whenever those inputs change.
- The software shall show disk usage summary text in the control region when disk status is available.
- The software shall let the operator open a filters modal, apply structured filters, and refetch the list from combined text and structured criteria.
- The software shall let the operator export or delete the current selection from the control region, and block delete when any selected study is currently exporting.
- The software shall reflect study deletion progress and completion using realtime messages and compact toasts, including guidance not to disconnect hardware while deletion runs.
- The software shall open the export-case modal from toolbar or list callbacks and navigate to the PACS or USB route with studies and format metadata in router state when the operator confirms destination choice.
- The software shall navigate from the archive list Open Study action into the case viewer for the selected study, passing study identity needed to load that case.

**Dependencies:**

- **APIs:**
  - Archive health check API — Confirms archive service readiness for the client
  - Get archive studies API — Returns paged archived studies and totals
  - Get disk status API — Returns mount and byte usage for the archive volume
  - Get configured devices API — Supplies devices for filter modal
  - Get study delete progress API — Lists studies mid-deletion on first paint
  - Delete studies API — Queues deletion for ids or delete-all
- **State:** Archive page UI context for sort order, debounced search text, and applied filters; local selection, modal visibility, deletion tracking, and cached study rows in the container; export-in-progress study ids derived from the export status hook on the route shell.

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| onGrubModeChange | () => Promise<void> | Switches device export mode when requested |
| exportingStudyDbIds | ReadonlySet<number> | Study ids with in-progress export |
| open | boolean | Whether export destination modal is visible |
| studies | StudyItem[] | Studies targeted by export action |
| onClose | () => void | Closes export modal without navigating |
| onExportToPacs | (studies: StudyItem[]) => void | Navigates to PACS path after PACS choice |
| onExportToUsbDevice | (studies: StudyItem[], formats: UsbDeviceExportFormat[]) => void | Navigates to USB path with formats |
| isUsbDeviceEnabled | boolean | Whether external-disk card is interactive |
| selectedIds | Set<number> | Current checkbox selection |
| onExportSelected | () => void | Opens export modal for selection |
| onDeleteSelected | (ids: number[]) => void | Deletes many studies after confirm |
| deleteStudiesDisabled | boolean | Disables bulk delete control |
| sortBy | StudySortBy | Active sort column key |
| sortOrder | SortOrderType | Ascending or descending column sort |
| onSortChange | (sortBy: StudySortBy, order: SortOrderType) => void | Changes list ordering |
| searchValue | string | Controlled search field text |
| onSearchChange | (value: string) => void | Updates debounced search pipeline |
| onFiltersClick | () => void | Opens archive filters modal |
| onOpenStudy | (study: StudyItem) => void | Opens case viewer for one study |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| insertItems | (items: ExportStatusItem[]) => void | Merges jobs from navigation seed |
| restartOverlayVisible | boolean | Whether restart overlay is visible |
| onGrubModeChange | () => Promise<void> | Same handler forwarded to header |
| isSocketConnected | boolean \| null | Whether export socket is connected |
| connectSocket | () => void | Reconnect helper for auto-reconnect |
| setStudiesPromise | function | Starts or replaces studies fetch tracking |
| isStudiesResolved | boolean | Whether first studies fetch finished |
| setDiskStatusPromise | function | Starts disk fetch or applies websocket patch |
| setDevicesPromise | function | Starts configured-device fetch tracking |
| addToast | (toast) => string | Shows archive deletion toasts |
| showAPIFetchErrorMessage | function | Shows API failure modal with retry |
| showMessage | function | Shows confirm dialogs for delete |

**Implementation Details:**

The route entry wraps the interactive region in a layout container and polls the archive health endpoint at a short interval until the service reports ready, showing a loader and message until then. Only after readiness does the main archive container mount alongside the export status strip.

When navigation state carries export items from a completed PACS or USB submission, an effect on the route shell merges them into the export status hook once. This is done so that the exported items are shown on the export status bar immediately intead of waiting for the API call to get the export status. Active export statuses are folded into a read-only set of study database ids passed into the container so bulk delete and list affordances stay aligned with jobs still running.

The archive container titles the surface, exposes export-mode switching, and reads shared UI context for sort, debounced search, and applied filters. It issues abortable study queries whenever that bundle changes, loads disk usage and configured devices on separate lifecycles, and surfaces failures through the shared API error modal with optional retry. The control strip combines sort, search, filters, memory summary, and contextual export or delete actions when rows are selected.

Deletion is confirmed through the shared message dialog, queued via REST, and tracked with websocket updates plus a one-time delete-progress read on first paint. Study file-size readiness also merges into the cached list over the socket. The export-case modal captures PACS versus external-disk intent: PACS offers model video DICOM; external disk offers full study or per-format checkboxes. The primary action label switches between server and disk selection paths. Confirming closes the modal, clears local study buffer, and navigates with studies, select-all flag, and USB format list in state for the PACS export or USB export units.

Open Study is wired from the list into a navigation handler on the container that leaves the archive route and opens the case viewer for the row’s study. The viewer is a separate study-review surface where the operator reviews clips and related workflow for that archived case.

**Child Components:** Archive control strip (`ArchiveControlBar`, sort, search, filters, selection actions), archive list (`ArchiveListComponent`, documented in Unit 8.5.2.b), archive filters modal (`ArchiveFiltersModal`, structured filter form), export case modal (`ExportCaseModal`, PACS vs external disk choice), view report modal (`ViewReportModal`, read-only report), export-mode restart overlay (`GrubModeRestartOverlay`, blocking restart prompt).

### 8.5.2.b Archive list

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that renders the selectable archived-study table with expandable detail rows, per-row Open Study navigation into the case viewer, USB import workflow, and an overflow menu for bookmark, export, and delete.

**Software Requirements:**

- The software shall present one row per archived study with columns for selection, identity, procedure date, file size, and row actions.
- The software shall let the operator select individual rows or toggle select-all from the header checkbox.
- The software shall expand and collapse a detail row on row activation and show supplemental study metadata when expanded.
- The software shall show exporting, full-study-exported, and bookmark cues on rows from parent-supplied study and export state.
- The software shall invoke parent handlers for view report, bookmark, export, and delete from row controls or the overflow menu.
- The software shall open the case viewer when the operator activates Open Study, by calling the parent handler with the row’s study record.
- The software shall open an import-study modal that browses USB paths and show progress while import runs, then forward the imported study to the parent on success.

**Dependencies:**

- **APIs:**
  - Import study API — Imports a study file from a USB path
  - Bookmark study API — Invoked indirectly through parent bookmark handler
- **State:** Local expanded-row ids, import modal visibility, and import-in-progress flag; USB device list maintained via archive websocket events inside this unit.

**Custom Hooks**

| Hook | Return value | Purpose |
|------|----------------|---------|
| useRowMenuDropdown | Open index, anchor ref, selected study, toggles | Anchors per-row overflow for export, delete, bookmark |
| useUsbDeviceWebsocketSync | USB devices array, promise setter, error | Keeps USB list in sync for import modal |

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| loading | boolean | Whether study query is unresolved |
| studies | StudyItem[] | Rows after parent deletion filters |
| selectedIds | Set<number> | Current checkbox selection |
| onSelectionChange | (ids: Set<number>) => void | Updates selection state |
| onOpenStudy | (study: StudyItem) => void | Opens case viewer for study |
| onViewReport | (study: StudyItem) => void | Opens report modal |
| onBookmark | (id: number, bookmarked: boolean) => void | Persists bookmark toggle |
| onExport | (study: StudyItem) => void | Opens export modal for one study |
| onDelete | (ids: number[]) => void | Confirms then queues deletion |
| onStudyImported | (study: StudyItem) => void | Upserts imported study into parent list |
| sortOrder | SortOrderType | Ascending or descending column sort |
| onSortChange | (sortBy: StudySortBy, order: SortOrderType) => void | Changes list ordering |
| exportingStudyDbIds | ReadonlySet<number> | Shows exporting label on matching rows |
| open | boolean | Whether import study modal is visible |
| onClose | () => void | Closes import modal |
| onConfirm | (usbName: string, path: string) => void | Starts import from USB path |
| usbDevices | UsbDevice[] | Roots shown in import browser |
| loadingUsbDevices | boolean | Whether USB roots are loading |
| onLoadChildren | (usbName: string, path: string) => Promise<FileNode[]> | Loads USB folder children |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| menuDropdownOpen | boolean | Whether overflow menu is visible |
| selectedItem | StudyItem \| null | Row tied to open overflow menu |
| menuAnchorRef | MutableRefObject | Anchor element for dropdown |
| onMenuButtonClick | function | Toggles anchored menu for one row |
| closeMenu | () => void | Collapses overflow menu |
| usbDevices | UsbDevice[] | USB list from websocket sync hook |
| setUsbDevicesPromise | function | Starts USB device fetch tracking |
| isUsbDevicesResolved | boolean | Whether USB roots fetch finished |
| showAPIFetchErrorMessage | function | Shows API failure modal with retry |

**Implementation Details:**

The list renders a fixed-column table with a header row that supports select-all indeterminate state, column sort shortcuts on procedure date and file size, and a prominent import control. Each body row pairs a checkbox with study identity, patient name, formatted date, and file size that may show a loading placeholder until the backend reports size. Row activation toggles expansion; a nested expanded row component shows location, simulation counts, and related metadata when open.

Row actions include Open Study, view report, an overflow menu, and an expand chevron. Open Study calls the parent handler so the archive container can navigate into the case viewer for that study’s identity. View report and overflow actions stay on the archive surface; bookmark, export, and delete call back into the container. Export may show a full-study-exported hint when the record flag is set. Studies with active exports show a short exporting label instead.

Import opens a modal that lists USB roots when visible. The unit refreshes devices on open and listens on the archive websocket for plug and unplug events so the tree stays current. Folder children load through a browse helper (mock-backed in current code). Confirming runs import, shows a blocking progress modal, and on success forwards the returned study to the parent for list upsert. Failures use the standard API error path with optional retry.

**Child Components:** Expanded detail row (`ArchiveListExpandedRow`, supplemental study fields), import study modal (`ImportStudyModal`, USB path browser), import progress modal (`ImportProgressModal`, blocking copy progress).

### 8.5.2.c PACS export

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that receives studies from archive navigation state, loads and manages configured PACS nodes, verifies connectivity for the default server, and submits model-video export back to the archive route with export job rows for the status strip.

**Software Requirements:**

- The software shall read the study set and select-all flag from router state supplied when the operator leaves the archive export-case modal on the PACS path.
- The software shall load configured PACS nodes on mount using an abortable request and show the default node’s listener attributes in a this-device summary strip.
- The software shall let the operator add, edit, delete, and designate a default PACS node, ping nodes from the list, and require a successful ping on the default node before enabling export.
- The software shall submit export for the carried studies against the default PACS node and navigate to the archive route with constructed export status items on success.
- The software shall return the operator to the archive route when they activate back on the route shell.

**Dependencies:**

- **APIs:**
  - Get PACS nodes API — Reads configured PACS server catalog
  - Add PACS node API — Creates a PACS server record
  - Update PACS node API — Persists edits including default flag
  - Delete PACS node API — Removes a PACS server by id
  - Ping PACS node API — Checks reachability for one node
  - Export to PACS API — Queues model-video export jobs for study ids
- **State:** Router location state for `studies` and `selectAllStudies`; local PACS node list, modal visibility, and ping-in-flight node id.

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| studies | StudyItem[] | Cases to export from navigation state |
| selectAllStudies | boolean | Whether archive select-all was active |
| loading | boolean | Whether PACS node query is unresolved |
| pacsNodes | PacsNode[] | Configured server rows for the table |
| editPacsModalOpen | boolean | Whether edit modal is visible |
| deletePacsModalOpen | boolean | Whether delete modal is visible |
| setEditPacsModalOpen | (open: boolean) => void | Opens or closes edit modal |
| setDeletePacsModalOpen | (open: boolean) => void | Opens or closes delete modal |
| onUpdatePacsNode | (node: PacsNode) => void | Persists edits from edit modal |
| onDeletePacsNode | (id: number) => void | Removes node after confirmation |
| onSetDefaultPacsNode | (id: number) => void | Sets default after ping succeeds |
| pingingNodeId | number \| null | Node id currently being pinged |
| open | boolean | Whether add-PACS modal is visible |
| onClose | () => void | Closes add modal without saving |
| addPacsNode | (data: Omit<PacsNode, 'id'>) => void | Submits new server form |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| setPacsNodesPromise | function | Starts or replaces PACS list fetch |
| isPacsNodesResolved | boolean | Whether first PACS fetch finished |
| onPingPacsNode | (id: number) => Promise<boolean> | Pings node and updates row ping flag |
| addToast | (toast) => string | Shows ping failure toast |
| showAPIFetchErrorMessage | function | Shows API failure modal with retry |
| navigate | NavigateFunction | Returns to archive with export items |

**Implementation Details:**

The route shell provides back navigation to the archive path and hosts the PACS body plus the export status strip documented in Unit 8.5.2.e. The body reads studies from location state and shows them beside the page title through a compact case summary component.

On mount the container fetches all PACS nodes. When resolution succeeds and a default node has never been pinged, it automatically pings that node so the operator sees reachability before export. The this-device strip mirrors listener port, AE Title, and IP from the default node record. Configured servers appear in a table with row actions for edit, delete, set default, and ping; ping updates an per-row boolean and shows an error toast when the check fails without throwing.

Add, update, and delete mutations refresh the in-memory node array and close their modals on success. Export stays disabled until a default node exists and its last ping succeeded. Submitting export calls the export service with study database ids, the default node id, and the select-all flag, then maps returned jobs into export status items labeled for PACS and navigates to the archive route with those items in state for the strip to absorb. Failures surface through the shared API error modal with optional retry on export or CRUD operations.

**Child Components:** PACS server table (`PACSListComponent`, row actions and modals), add PACS modal (`AddPacsModal`, registers a server), export case summary (`ExportCaseInfo`, study count header).

### 8.5.2.d USB export

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that receives studies and format selections from archive navigation state, lists writable USB devices with live plug events, lets the operator adjust formats and anonymisation, and submits external-disk export back to the archive route with export job rows for the status strip.

**Software Requirements:**

- The software shall read the study set, USB format list, and select-all flag from router state supplied when the operator leaves the archive export-case modal on the external-disk path.
- The software shall load available USB devices on mount using an abortable request and keep the list aligned with USB added and removed websocket events.
- The software shall pre-select the first resolved device when the list becomes available.
- The software shall let the operator toggle anonymised patient data, refine export formats from the header dropdown, and select exactly one USB device from the list.
- The software shall enable export only when a writable device is selected, at least one format is active, and studies are present.
- The software shall submit export for the carried studies and formats against the selected device and navigate to the archive route with constructed export status items on success.
- The software shall return the operator to the archive route when they activate back on the route shell.

**Dependencies:**

- **APIs:**
  - Get USB devices API — Reads mounted external disks for export
  - Export to USB device API — Queues external-disk export jobs with formats
- **State:** Router location state for `studies`, `formats`, and `selectAllStudies`; local selected device id, export format set, and anonymised flag; USB device list via websocket sync hook.

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| studies | StudyItem[] | Cases to export from navigation state |
| formats | UsbDeviceExportFormat[] | Initial formats from navigation state |
| selectAllStudies | boolean | Whether archive select-all was active |
| loading | boolean | Whether USB device query is unresolved |
| usbDevices | UsbDevice[] | Available drives for selection |
| selectedId | number \| undefined | Currently selected USB device id |
| onSelectUsbDevice | (id?: number) => void | Updates selected drive |
| exportFormats | Set<UsbDeviceExportFormat> | Active format flags in header |
| onFullStudyChange | () => void | Selects every USB export format |
| onExportFormatChange | (value: UsbDeviceExportFormat) => void | Toggles one format flag |
| anonymized | boolean | Whether patient data is anonymised |
| onChange | (e) => void | Toggles anonymised checkbox |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| setUsbDevicesPromise | function | Starts USB device fetch tracking |
| isUsbDevicesResolved | boolean | Whether first USB fetch finished |
| usbDevices | UsbDevice[] | USB list from websocket sync hook |
| showAPIFetchErrorMessage | function | Shows API failure modal with retry |
| navigate | NavigateFunction | Returns to archive with export items |

**Implementation Details:**

The route shell mirrors the PACS export layout: back control to the archive path, the USB body, and the shared export status strip. The header shows the page title, case summary for the carried studies, and a format dropdown seeded from navigation state so the operator can still widen or narrow formats before export. An anonymise-patient-data checkbox defaults on and travels with the export request.

The device section lists available USB drives with status cues; only writable drives satisfy the export guard. When the list first resolves, the first device is selected automatically. Export calls the USB export service with study ids, selected device id, active formats, select-all flag, and anonymisation choice, then maps jobs into export status items labeled for pen drive with the drive name and navigates to the archive route. USB plug and unplug events update the list without a full page reload so operators see newly attached media while configuring export.

**Child Components:** USB device table (`UsbDeviceListComponent`, selectable drive rows), export format dropdown (`ExportFormatDropdown`, full study and per-format toggles), export case summary (`ExportCaseInfo`, study count header).

### 8.5.2.e Export status bar

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that hydrates and maintains export job rows, presents a collapsible bottom strip grouped by destination, and exposes stop, discard, troubleshoot, and dismiss actions on the archive, PACS, and USB routes.

**Software Requirements:**

- The software shall load export progress on mount and merge export-related websocket events into the job list by job id.
- The software shall render the strip only when at least one job row exists, grouping rows by destination label and omitting fully cancelled successes from grouped sections.
- The software shall summarize in-flight, failed, and partially failed counts in the expandable header region.
- The software shall require explicit confirmation before discarding in-progress uploads from the strip close control, then cancel all active jobs before clearing the list when confirmed.
- The software shall let the operator stop individual jobs, open a troubleshooting modal for failures, and dismiss rows that failed cancellation.
- The software shall expose merge, clear, stop, and remove helpers for the route shells that host the strip.

**Dependencies:**

- **APIs:**
  - Get export progress API — Loads active and recent export jobs
  - Cancel export studies API — Stops one job, many jobs, or all active exports
- **State:** Export job rows and per-job cancel-in-flight flags in the export status hook (not Redux).

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| items | ExportStatusItem[] | Jobs rendered inside the strip |
| stoppingJobIds | ReadonlySet<number> | Shows per-row stop spinners |
| onClearAllExportItems | () => void | Clears strip after confirm |
| onStopExport | (jobIds: number[], cancelAll: boolean) => Promise<void> | Calls cancel API from strip |
| onRemoveExportItems | (jobIds: number[]) => void | Removes dismissed failure rows |
| inProgressItemCount | number | Active jobs for header summary |
| expanded | boolean | Whether strip body is expanded |
| onHeaderClick | () => void | Toggles strip expansion |
| onCloseClick | (e: MouseEvent) => void | Confirms discard or clears strip |
| groupedItems | GroupedExportSection[] | Jobs grouped by destination label |
| onToggleSection | (label: string) => void | Expands one destination group |
| onOpenTroubleshootModal | (e: MouseEvent) => void | Opens failure guidance modal |
| open | boolean | Whether troubleshoot modal is visible |
| onRemoveItems | (jobIds: number[]) => void | Removes rows from troubleshoot modal |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| items | ExportStatusItem[] | Current export job list |
| insertItems | (items: ExportStatusItem[]) => void | Merges jobs into list by job id |
| stopExport | (jobIds: number[], cancelAll: boolean) => Promise<void> | Invokes cancel export service |
| clearAllExportItems | () => void | Empties export list and stopping set |
| removeExportItems | (jobIds: number[]) => void | Drops jobs from list after dismiss |
| stoppingJobIds | ReadonlySet<number> | Tracks jobs in cancel flight |

**Implementation Details:**

A dedicated hook owns export state for each route that mounts the strip. It performs an initial REST read, subscribes to queued, processing, success, failure, partial failure, and cancel websocket events, and upserts rows by job id so the UI tracks server truth while the operator stays on archive, PACS, or USB surfaces. Route shells on the archive page also call the merge helper once when navigation state carries fresh jobs from a completed submission.

The strip stays hidden until at least one row remains after filtering out cancel-success items from grouped views. The header shows how many uploads are still active and expands to reveal failure summaries, cancel-failed dismiss actions, and body sections keyed by destination labels that distinguish PACS from pen drive and include configured destination names when present. Closing the strip with active work opens a confirmation dialog; confirming issues cancel-all, waits for the API response to adjust statuses, then clears local state. Per-row stop icons pass specific job ids while the hook marks those ids as stopping so spinners appear without blocking unrelated rows.

A troubleshooting modal lists problematic jobs and can remove selected rows after review. The same hook powers export-in-progress study id derivation on the archive route so list and container units can disable destructive actions consistently.

**Child Components:** Export status header (`ExportStatusBarHeader`, summary and close), export status header details (`ExportStatusBarHeaderDetails`, failure counts), export status body (`ExportStatusBarBody`, grouped rows and stop controls), troubleshoot export modal (`TroubleshootExportModal`, failure review and dismiss).
