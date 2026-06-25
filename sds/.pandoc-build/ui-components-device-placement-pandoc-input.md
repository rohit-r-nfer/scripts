---
title: SDS — Device Placement module (UI excerpt)
---

*Other UI modules: documented in separate SDS excerpts (TBD).*

## 8.5.2 Device Placement module

**Purpose:**

The Device Placement module lets the operator review transesophageal echo clips for placement (“Device TEEs”), choose which clips contribute to placement analysis, select an implant size model, inspect frame-level geometry and compression in a table, and open the active clip in a DICOM viewer with measurements and device-related frame navigation. Incoming clips and import status can arrive while the module is open. A footer provides return navigation, a pointer-display toggle, adjunctive-use messaging for placement, and an end-study control.

**Software Requirements:**

• The software shall load the placement video catalog when the module opens and shall keep that list aligned with the operator’s sort choice until the module closes.

• The software shall surface recoverable and non-recoverable catalog faults with operator-readable messaging and optional retry when the backend allows it.

• The software shall accept new placement videos pushed from the realtime channel while the module is open and shall merge or queue them according to whether the video strip is scrollable.

• The software shall translate DICOM import lifecycle events from the realtime channel into on-screen notifications and shall clear in-progress indicators when an import finishes, fails, or is dropped.

• The software shall reset module-scoped client state when the operator leaves the module so stale lists, toasts, and in-flight requests do not carry forward.

• The software shall keep the active clip, multi-select set, table row highlight, filters, and related navigation context in the address bar so refresh and mirrored sessions can restore context where the product model allows.

• The software shall show the implant device list, remember the active device for the session, and persist a device change to the backend when the operator selects a different device.

• The software shall derive placement metrics only from clips the operator has selected for analysis and shall recompute those metrics when the underlying clip set changes.

• When an active clip is available, the software shall present the shared DICOM review surface with placement-specific labels, toolbar actions, seek affordances, device-frame navigation, and persistence of manual measurements for that clip.

• The software shall display adjunctive-use text for device placement in the module footer whenever this module is shown.

**Module Structure:**

This module consists of the following software units:

• Unit 8.5.2.a: Device Placement module container
• Unit 8.5.2.b: Device TEEs list, selection, and archive workspace
• Unit 8.5.2.c: Implant device selector and placement metrics workspace
• Unit 8.5.2.d: DICOM placement video review and measurement workspace
• Unit 8.5.2.e: Module footer for study navigation and pointer display

---

### 8.5.2.a Device Placement module container

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that orchestrates entry to the Device Placement workflow, cooperative loading of the placement video list, realtime ingestion of new videos and DICOM import notifications, coordination of query-parameter state across the list, metrics table, and viewer, global teardown, and composition of the regulated adjunctive-use footer region.

**Software Requirements:**

• The software shall request the placement video list when the container mounts and whenever the declared sort order in the address bar changes, using cooperative cancellation when the container unmounts mid-request.

• The software shall push loading and result payloads for the video list into centralized application state so the list and dependent surfaces share one source of truth.

• The software shall subscribe to realtime events for newly received videos and shall insert or queue them so the operator sees new clips without leaving the module.

• The software shall subscribe to realtime DICOM import notifications and shall record structured notification entries for running, failed, and dropped imports, including resolution text when the backend supplies it.

• The software shall mirror pending notification records into the global toast system and shall remove a toast when the operator dismisses the matching notification entry.

• The software shall clear application slices and dismiss toasts on unmount.

• The software shall record the document referrer in the address bar on first entry when it is not already set, so later navigation can return the operator to the prior context.

• The software shall keep the table row highlight parameter consistent with the active clip and the current multi-select set.

• The software shall supply each child region with the callbacks and derived maps it needs from the centralized video and device state.

**Dependencies:**

- **APIs:**
  - Get Device Placement videos API — Retrieves sorted placement clip catalog
  - Realtime Device Placement channel — Receives new videos and DICOM import lifecycle payloads
- **State:** Redux state for placement videos list, import notifications, video loading, device metrics and active implant, global pointer display preference

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| VideoListPanel — videoListRef | React ref to HTML element | Scroll container for the Device TEEs strip; used by parent for scrollability calculations. |
| VideoListPanel — archiveUnselectedVideos | Callback | Invokes archive flow for clips not in the current multi-select set. |
| VideoListPanel — callArchiveVideos | Callback (video IDs) | Archives the given clips after server confirmation. |
| VideoListPanel — callUnarchiveVideos | Callback (video IDs) | Restores archived clips after server confirmation. |
| DeviceMetrics — videoIdToNameMap | Record of string to string | Maps clip identifiers to display names for the metrics table. |
| DeviceMetrics — videos | Array of placement video records | Full catalog used to recompute metrics when selection changes. |
| DeviceMetrics — addSelectedRowVideoId | Callback (video ID) | Writes the highlighted table row into query parameters. |
| Player — currentVideo | Placement video record | Active clip for the DICOM workspace; rendered only when defined. |
| Player — currentMetric | Metric record or undefined | Compression and geometry for the active clip under the current implant model. |
| Player — callUnarchiveVideos | Callback (video IDs) | Restores the active clip from archived state from the viewer strip. |
| Player — addSelectedRowVideoId | Callback (video ID) | Aligns table highlight with the viewer when the operator focuses a row already active. |
| Player — clearRowSelection | Callback | Clears the table row highlight before seek or play actions. |
| Footer — showPointerIndicator | Boolean | Whether the pointer indicator overlay is enabled. |
| Footer — onShowPointerIndicatorChange | Callback (boolean) | Updates global preference when the operator toggles pointer display. |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| Videos list in application state | Array | Updated by fetch, merge, and archive flows for child units. |
| Notification records in application state | Array | Structured entries driving toasts for DICOM import and errors. |
| Query parameters | URL state | Referrer capture; selected clip IDs; active clip; sort; row highlight kept in sync with navigation. |
| Toast presentations | UI side effect | Notifications mirrored into the toast system with dismiss wiring. |
| Teardown on unmount | Side effect | Aborts in-flight list request, resets slices, clears toasts. |

**Implementation Details:**

The container reads placement videos, device metrics, notifications, and global pointer preference from Redux. On mount it stores `document.referrer` into query state once, installs an `AbortController` for list fetches, and calls `getDicomVideos` whenever sort order changes; results flow through sender-guarded dispatchers into `videos` slice loading and list fields. Two websocket subscriptions call `transformVideo` for `DICOM_VIDEO_RECEIVE` (queue vs immediate merge based on whether the strip is scrollable) and map `DICOM_NOTIFICATION` statuses to `running`, `failed`, or `dropped` messages, updating processing IDs and notification records. A `useEffect` bridges `notifications` to `useErrorToast` with per-id close handlers. Another effect aligns `SELECTED_ROW_VIDEO_ID` with `ACTIVE_VIDEO_ID` and the multi-select set. `currentVideo` and `metricForCurrentVideo` are memoized for the Player. On unmount the controller aborts, `resetAllSlices` runs, and toasts clear.

---

### 8.5.2.b Device TEEs list, selection, and archive workspace

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that orchestrates the collapsible “Device TEEs” strip: sorting, multi-select and select-all, active clip selection, archived vs unarchived views, queued-video intake, swipe-to-archive gestures, and coordination of scroll behavior with the shared video list primitives.

**Software Requirements:**

• The software shall let the operator sort placement clips, switch between unarchived and archived views, and collapse or expand the strip without losing list state held in application state and the address bar.

• The software shall let the operator select one active clip for the viewer and a multi-select set for metrics, persisting both in the address bar.

• The software shall let the operator archive or unarchive clips individually or in bulk and shall refresh selection in the address bar after archive success.

• The software shall offer a control to merge queued clips into the visible list when the product has queued realtime arrivals.

• On mirrored receiver sessions, the software shall prevent default scroll chaining on the list container where the shared platform behavior requires it.

**Dependencies:**

- **APIs:**
  - Archive Device Placement videos API — Persists archive or unarchive for one or more clips (invoked via callbacks supplied by the parent container)
- **State:** Redux state for placement videos list, list chrome (sort and menu dropdown visibility, vertical scroll percentage, swipe translation, panel collapsed flag, queued videos, per-card DICOM processing IDs)

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| VideoListPanel — videoListRef | React ref to HTML element | Attached to the scrollable list region for shared scroll hooks. |
| VideoListPanel — archiveUnselectedVideos | Callback | Archives all clips not currently multi-selected. |
| VideoListPanel — callArchiveVideos | Callback (video IDs) | Parent-wrapped archive API flow. |
| VideoListPanel — callUnarchiveVideos | Callback (video IDs) | Parent-wrapped unarchive API flow. |
| CollapsedPanel — visible | Boolean | Whether the strip is collapsed to a narrow rail. |
| CollapsedPanel — onClick | Callback | Expands the strip from the collapsed rail. |
| TopBar — disabled | Boolean | Disables top actions when loading or when the active view has no clips. |
| TopBar — sortOrder | Enumeration | Current ascending/descending choice mirrored in the address bar. |
| TopBar — sortDropdownVisible | Boolean | Controls sort menu visibility. |
| TopBar — onSortDropdownVisible | Callback (boolean) | Toggles sort menu visibility in application state. |
| TopBar — onSortOrderChange | Callback (sort by, sort order) | Writes sort fields to the address bar. |
| TopBar — selectedVideoIds | Array of strings | Current multi-select from query parameters. |
| TopBar — videoProcessing | Array of strings | Clip IDs currently showing DICOM processing on cards. |
| TopBar — numberOfVideos | Number | Count for the active archived or unarchived view. |
| TopBar — numberOfVideosSelected | Number | Size of the multi-select set. |
| TopBar — onToggleSelectAllVideos | Callback | Selects all unarchived clips or clears selection. |
| TopBar — toggleSelectAllVideosIndeterminate | Boolean | Indeterminate visual state when some but not all clips are selected. |
| TopBar — onCollapse | Callback | Collapses the strip. |
| TopBar — menuDropdownVisible | Boolean | Overflow menu visibility. |
| TopBar — onMenuDropdownVisible | Callback (boolean) | Toggles overflow menu visibility. |
| TopBar — onArchiveUnselectedVideos | Callback | Invokes bulk archive of unselected clips. |
| TopBar — isArchiveView | Boolean | Whether the list shows archived clips. |
| TopBar — onViewUnarchivedVideos | Callback | Switches filter to unarchived clips. |
| TopBar — loadQueuedVideos | Callback | Merges queued videos into the list and clears the queue. |
| TopBar — numberOfQueuedVideos | Number | Badge count for queued arrivals. |
| VideoList — videos | Array | Clips for the current archived or unarchived view. |
| VideoList — isLoading | Boolean | Shows skeleton cards while the catalog request runs. |
| VideoList — selectedVideoIds | Array of strings | Multi-select membership per card. |
| VideoList — activeVideoId | String or null | Which clip is active for the viewer. |
| VideoList — swipeState | Object | Horizontal swipe progress for archive gesture. |
| VideoList — onVideoClick | Callback (video ID) | Sets the active clip in the address bar. |
| VideoList — onVideoSelect | Callback (video ID) | Toggles membership in the multi-select set in the address bar. |
| VideoList — onArchive | Callback (video IDs) | Archives after swipe with swipe flag supplied by parent wiring. |
| VideoList — onUnarchive | Callback (video IDs) | Restores archived clips. |
| VideoList — onSwipeProgress | Callback (swipe state) | Updates swipe translation in application state. |
| VideoListFooter — numberOfArchivedVideos | Number | Drives archived-view entry affordance. |
| VideoListFooter — onViewArchivedVideos | Callback | Switches filter to archived clips. |
| VideoListFooter — disabled | Boolean | Disables footer controls while loading. |
| VideoListFooter — isArchiveView | Boolean | Adjusts footer labeling for context. |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| Address bar updates | URL state | Active clip, multi-select, sort, archived filter, and merge-queue action. |
| Redux list chrome updates | Various | Dropdown visibility, scroll percentage, swipe state, panel collapse, seeker-options flag when collapse toggles. |
| Receiver scroll guard | Side effect | `preventDefaultScroll` applied once for receiver mode. |

**Implementation Details:**

`VideoListPanel` reads list state from the `videos` slice and query parameters for selection, active clip, sort, and filter. It splits the catalog into unarchived and archived arrays for display. `useScroll` binds vertical scroll percentage to Redux for downstream metrics chrome. `toggleSelectAllVideos` and `onVideoSelect` rewrite `SELECTED_VIDEO_IDS`; `onVideoClick` sets `ACTIVE_VIDEO_ID`. `loadQueuedVideos` sets the filter to unarchived and dispatches `loadQueuedVideos` to merge `queuedVideos` into `videos` client-side. `TopBar` receives archive and queue controls; `VideoList` maps to `SwipeableVideoCard` with archive and unarchive callbacks from props. Toggling panel collapse dispatches `setShowSeekerOptions` in the player slice so seek UI stays coherent when the strip hides.

---

### 8.5.2.c Implant device selector and placement metrics workspace

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that loads implant devices, persists the operator’s device choice, derives per-clip geometry metrics for the multi-selected set, and presents summary cards and a sortable, filterable angle table with scroll-to-top affordances linked to the metrics table scroll position.

**Software Requirements:**

• The software shall load the implant device catalog and server default selection when the workspace mounts.

• The software shall persist the operator’s device selection to the backend and shall revert the visible selection if the save fails.

• The software shall compute placement metrics rows from the multi-selected clips and shall refresh rows when selection or underlying clip geometry changes.

• The software shall prompt the operator to choose a device when clips are selected and no device is yet active.

• The software shall let the operator filter the angle table by maximum height or extreme compression values and shall clear filters on demand.

• The software shall let the operator jump from a table row to the viewer for that clip or, when already viewing that clip, align the table highlight with the viewer.

**Dependencies:**

- **APIs:**
  - Get implant devices API — Returns device catalog and active device from the server
  - Set active implant device API — Persists the operator-selected device
- **State:** Redux state for device list, loading flag, dropdown and popover visibility, current device, derived metrics rows, table filter, scroll percentage, back-to-top visibility

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| DeviceMetrics — videoIdToNameMap | Record of string to string | Display names for table rows. |
| DeviceMetrics — videos | Array of placement video records | Source geometry for selected clips. |
| DeviceMetrics — addSelectedRowVideoId | Callback (video ID) | Sets row highlight when focusing a row for the already-active clip. |
| DeviceSelector — devices | Array of device records | Implant catalog entries. |
| DeviceSelector — devicesLoading | Boolean | Disables interaction while loading or saving. |
| DeviceSelector — currentDevice | Device record or null | Active implant model. |
| DeviceSelector — dropdownOpen | Boolean | Device picker expanded state. |
| DeviceSelector — onDeviceChange | Callback (device) | Persists selection and updates local device state. |
| DeviceSelector — onDropdownOpenChange | Callback (boolean) | Toggles picker visibility. |
| DeviceSelector — devicePopoverOpen | Boolean | Onboarding-style prompt visibility. |
| DeviceSelector — onDevicePopoverOpenChange | Callback (boolean) | Closes or opens the prompt. |
| MetricCards — maxHeight | Number | Derived tallest shoulder height among selected clips. |
| MetricCards — minCompression | Number | Minimum compression percent across selected clips for current device. |
| MetricCards — maxCompression | Number | Maximum compression percent across selected clips. |
| MetricCards — filterTableBy | Enumeration or null | Active table filter mode. |
| MetricCards — onFilterChange | Callback (filter) | Applies a height or compression filter to the table. |
| AngleTable — selectedRowVideoId | String or null | Highlighted row from query parameters. |
| AngleTable — onAngleClick | Callback (video ID) | Navigates active clip or sets row highlight. |
| AngleTable — scrollContainerRef | React ref | Scrollable metrics region for back-to-top. |
| AngleTable — scrollPercentage | Number (0–1) | Vertical scroll position for chrome. |
| AngleTable — onScroll | Callback (number) | Writes scroll percentage to application state. |
| AngleTable — filterTableBy | Enumeration or null | Active filter; used for clear affordance. |
| AngleTable — onClearFilter | Callback | Clears table filter. |
| AngleTable — maxHeight | Number | Same as summary cards for consistent filtering. |
| AngleTable — minCompression | Number | Same as summary cards. |
| AngleTable — maxCompression | Number | Same as summary cards. |
| AngleTable — angles | Array of metric rows | Rows after filter and compression derivation. |
| AngleTable — videoIdToNameMap | Record of string to string | Row titles. |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| Device and metrics Redux updates | Slice actions | Loading, catalog, current device, metrics array, UI chrome. |
| Query parameter updates | URL state | Active clip when navigating from a row for a non-active clip. |
| Error toasts | UI side effect | Load or save failures with optional retry from shared messaging. |

**Implementation Details:**

On mount the unit calls `getDicomDevices` with sender guarding and populates devices plus `currentDevice` from the response. A `useEffect` rebuilds `metrics` from `videos` filtered by `SELECTED_VIDEO_IDS`, sorted by angle, and dispatches `setMetrics`. Changing selection closes the device dropdown; another effect opens the device popover when there is a multi-select but no `currentDevice`. `handleDeviceChange` optimistically sets the device, calls `saveActiveDevice`, and rolls back on error. Compression values attach when `currentDevice` exists; `MetricCards` and `AngleTable` share derived min/max and filter state. `handleAngleClick` either sets `ACTIVE_VIDEO_ID` or calls `addSelectedRowVideoId` when the row matches the active clip. Back-to-top appears when `scrollPercentage` is non-zero and scrolls the metrics container smoothly.

---

### 8.5.2.d DICOM placement video review and measurement workspace

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that presents the active placement clip in the shared DICOM stack viewer, loads and saves measurements, coordinates toolbar and overlay state with application state, synchronizes seek behavior with metrics row selection and device-detected frames, and surfaces placement-specific labels and seek affordances.

**Software Requirements:**

• The software shall load the DICOM stack for the active clip and shall surface load and buffering states to the operator.

• The software shall load persisted and AI-generated measurements for the active clip and shall transform AI geometry into viewer space before display.

• The software shall let the operator create, edit, undo, redo, and delete manual measurements and shall persist changes to the backend for that clip.

• The software shall honor segmentation and annotation overlay toggles and shall keep AI measurement visibility aligned with the segmentation overlay control.

• The software shall clear row highlight context before seek or play when that context would conflict with playback.

• The software shall navigate among device-detected frames from the seek rail and shall jump to the minimum-compression frame when the operator invokes the placement label control.

• When the metrics table ties the active clip to a selected row, the software shall seek to the device maximum-geometry frame for that clip until the operator changes frame or clears the binding.

**Dependencies:**

- **APIs:**
  - Get Device Placement video annotations API — Loads saved and AI measurements for the clip
  - Save Device Placement video annotations API — Persists manual measurements for the clip
- **State:** Redux state for DICOM playback, annotations, tool and overlay toggles, zoom and pan, seek UI options, segmentation failure bookkeeping

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| Player — currentVideo | Placement video record | DICOM path, duration, segmentation URLs, device geometry, device-detected frame indexes. |
| Player — currentMetric | Metric record or undefined | Compression label for `DPVideoLabel`. |
| Player — callUnarchiveVideos | Callback (video IDs) | Unarchives the active clip from the label strip. |
| Player — addSelectedRowVideoId | Callback (video ID) | Activates row highlight when jumping to min-compression frame. |
| Player — clearRowSelection | Callback | Passed into player hook for pre-seek clearing. |
| DicomPlayer — isFileLoading | Boolean | Stack load in progress. |
| DicomPlayer — dicomFileLoadError | Error or undefined | Fatal load failure. |
| DicomPlayer — isBuffering | Boolean | Decoder buffering indicator. |
| DicomPlayer — bottomPadding | Number | Layout offset for toolbar and footer. |
| DicomToolbar — layerControlsVisible | Boolean | Layer popover visibility. |
| DicomToolbar — isDeleteMeasurementDisabled | Boolean | Guards delete when nothing removable. |
| DicomToolbar — isUndoDisabled | Boolean | Undo stack empty. |
| DicomToolbar — isRedoDisabled | Boolean | Redo stack empty. |
| DicomToolbar — onResetDicom | Callback | Resets viewport manipulation. |
| DicomToolbar — onLayerControlVisibleChange | Callback (boolean) | Toggles layer popover. |
| DicomToolbar — onUndoMeasurement | Callback | Undoes last measurement edit. |
| DicomToolbar — onRedoMeasurement | Callback | Redoes measurement edit. |
| DicomToolbar — onDeleteMeasurement | Callback | Deletes selected measurement. |
| DicomToolbar — toggleLengthTool | Callback (boolean) | Activates length measurement tool. |
| DicomToolbar — isLengthToolActive | Boolean | Length tool active state. |
| DicomToolbar — showAnnotationOverlay | Boolean | Manual annotation overlay visibility. |
| DicomToolbar — onShowAnnotationOverlayChange | Callback (boolean) | Toggles manual annotations. |
| DicomToolbar — disabled | Boolean | Disables seekbar-adjacent controls when seekbar is disabled. |
| DicomToolbar — dicomToolbarPosition | Enumeration | Toolbar dock position. |
| DicomToolbar — onDicomToolbarPositionChange | Callback (position) | Persists toolbar position preference. |
| DicomToolbar — showSegmentationOverlay | Boolean | Segmentation overlay visibility. |
| DicomToolbar — onShowSegmentationOverlayChange | Callback (boolean) | Toggles segmentation. |
| PlayerFooter — duration | Number | Clip duration for seekbar. |
| PlayerFooter — isPlaying | Boolean | Playhead motion state. |
| PlayerFooter — annotations | Array | Measurements for marker positions. |
| PlayerFooter — disabled | Boolean | Seek interaction guard. |
| PlayerFooter — dicomFileLoaded | Boolean | Whether stack is ready for seek markers. |
| PlayerFooter — numberOfFrames | Number or undefined | Frame count from viewport. |
| PlayerFooter — setIsPlaying | Callback (boolean) | Play/pause control. |
| PlayerFooter — trackRef, thumbRef, trackLineRef | React refs | Seekbar DOM wiring. |
| PlayerFooter — showMagnifiedView | Boolean | Magnified seek interaction region. |
| PlayerFooter — percentagePlayed | Number | Current temporal position. |
| PlayerFooter — onFrameChange | Callback (frame index, …) | Seeks to frame with navigation wrapper for device frames. |
| PlayerFooter — onTimeLabelClick | Callback | Focuses time label interaction. |
| PlayerFooter — dicomPlayerApi | Object or undefined | Cornerstone viewport API for seek options. |
| PlayerFooter — showSeekerOptions | Boolean | Device-frame seek chip rail visibility. |
| PlayerFooter — showSeekbar | Boolean | Main seekbar visibility. |
| PlayerFooter — seekSpecificFramesOnly | Boolean | Restricts scrubbing to flagged frames when enabled. |
| PlayerFooter — onSeekSpecificFramesOnlyChange | Callback (boolean) | Toggles restricted seek mode. |
| PlayerFooter — deviceDetectedFrameIndexes | Array of numbers | Top seek markers for model-detected frames. |
| PlayerFooter — maxWidthFrameIndex | Number | Middle marker for minimum-compression frame. |
| DPVideoLabel — video | Placement video record | Title, geometry, archived flag. |
| DPVideoLabel — metric | Metric record or undefined | Compression readout. |
| DPVideoLabel — minCompressionButttonActive | Boolean | Highlights toggle when a metrics row is bound to the active clip. |
| DPVideoLabel — onGoToMinCompressionFrame | Callback | Seeks to max-geometry frame and selects row highlight. |
| DPVideoLabel — onUnarchive | Callback | Unarchives when banner shows archived state. |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| usePlayer hook surface | Many callbacks and refs | Drives DicomPlayer, toolbar, and footer; owns annotation load/save orchestration. |
| Annotation style and lock updates | Side effect | AI annotations styled and locked after load transform. |
| Toast clear on video index change | Side effect | Clears segmentation toasts when switching clips. |
| AI visibility coupling | Side effect | Toggles AI annotation visibility with segmentation overlay flag. |

**Implementation Details:**

`usePlayer` receives the active video, overlay and tool flags from Redux, segmentation URLs, hooks for metadata and segmentation failure, and custom `getAnnotationsApiCall` / `saveAnnotationsApiCall` that wrap `getDPAnnotations` and `saveDPAnnotations`. AI coordinates are converted from image to world space; styles and locks apply per annotation. `onBeforeSeekOrPlayRef` carries `clearRowSelection` without re-subscribing the seek module each render. `currentFrameIndex` is derived when the active clip is multi-selected and a row highlight exists, and an effect seeks to that frame. `useFrameNavigation` wraps frame changes to jump among `deviceDetectedFrameIndexes`. Autoplay is disabled when bound to a fixed frame index. `PlayerFooter` composes placement-specific seek options, seekbar markers for manual measurements and device frames, legends, and non-diagnostic text. `DPVideoLabel` shows title, min-compression navigation, and unarchive when archived.

---

### 8.5.2.e Module footer for study navigation and pointer display

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that presents return navigation to the prior study context (or home), toggles pointer-indicator display, shows adjunctive-use placement text, and exposes an end-study action region.

**Software Requirements:**

• The software shall navigate back using the stored referrer when available and shall fall back to the configured home route when referrer is absent.

• The software shall toggle the pointer indicator preference when the operator uses the pointer control.

• The software shall show adjunctive-use placement disclaimer text in the footer center region whenever this footer is shown.

**Dependencies:**

- **APIs:**
  - None.
- **State:** None at this unit boundary (pointer flag and change handler supplied by parent from global application state)

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| Footer — showPointerIndicator | Boolean | Current pointer overlay preference. |
| Footer — onShowPointerIndicatorChange | Callback (boolean) | Updates preference when the toggle is activated. |
| FooterComponent — leftSection | React node | Contains View Model button and divider. |
| FooterComponent — rightSection | React node | Pointer toggle, divider, and End Study button. |
| FooterComponent — centerSection | React node | Adjunctive-use typography. |
| AsyncButton (View Model) — onClick | Callback | Runs navigation helper. |
| ToggleIconButton — active | Boolean | Reflects pointer indicator on/off. |
| ToggleIconButton — onClick | Callback | Inverts pointer flag via `onShowPointerIndicatorChange`. |
| AsyncButton (End Study) — onClick | Callback | Invokes end-study handler (implementation incomplete in codebase). |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| dispatchRedirect | Side effect | Programmatic navigation to referrer path or home. |

**Implementation Details:**

`onViewModelClick` reads `REFERER` from query parameters; if missing it builds the SAMD home URL from `paths.ROUTES.SAMD_HOME`, otherwise parses the referrer URL, then dispatches `dispatchRedirect` with pathname and search. The pointer toggle calls `onShowPointerIndicatorChange` with the negated boolean. Center text states adjunctive use per internal copy. `onCompleteStudyClick` is wired to the End Study button but currently contains no implementation beyond a placeholder comment.
