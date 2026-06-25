---
title: "Ui Components Roi"
lang: en-US
---

## 8.5.1 Region of interest module

**Purpose:**

Enable clinicians to browse, review, and interpret qualified DICOM TEE video with automated region-of-interest results for adjunctive clinical use.

**Software Requirements:**

• The software shall read the target video identifier from the application URL and request ROI video metadata and geometry only when the client is the active sender instance.

• The software shall store the loaded ROI payload in centralized application state and reflect loading and error outcomes to the operator.

• The software shall show the DICOM ROI video viewer when ROI data is available, and shall otherwise show an in-player placeholder that distinguishes loading from an unusable clip.

• The software shall display a persistent adjunctive statement that ROI detection is not validated as a stand-alone diagnostic.

• The software shall abort in-flight ROI requests and reset module-owned application state when the surface unmounts so a later visit does not inherit stale data or notifications.

**Module Structure:**

This module consists of the following software units:

• Unit 8.5.1.a: Region of interest module container
• Unit 8.5.1.b: DICOM ROI video viewer

**Triggered By:** Navigation to the ROI route with a `videoId` query parameter (for example from the video listing or a deep link).

*Other UI modules: documented in separate SDS excerpts (TBD).*

### 8.5.1.a Region of interest module container

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that orchestrates URL-driven ROI video loading, centralized state updates, notification handling, and switching between the viewer and placeholder layout.

**Software Requirements:**

• The software shall obtain the video identifier from the query string and shall not call the ROI video service when that identifier is absent.

• The software shall dispatch loading and success callbacks into the videos slice on the sender instance and shall abort in-flight requests when the module unmounts.

• The software shall surface queued error notifications as operator toasts and shall clear mirrored-display toasts when those effects clean up on a receiver build.

**Triggered By:**

• Component mount (initial ROI load from query string)

• Changes to the centralized notification queue (toast registration)

**Dependencies:**

- **APIs:**
  - Get ROI DICOM video API — Loads ROI geometry, frame list, and DICOM serve path
- **State:** Redux `videos` slice for ROI video, loading flag, and notification queue; `resetAllSlices` on unmount

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| showMessage | `(message: MessageObject) => void` | Opens application message or modal |
| hideMessage | `() => void` | Closes the active application message |
| currentVideo | `ROIVideoType` | ROI payload passed to viewer child |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| showAPIFetchErrorMessage | `function` | Presents API error modal with optional retry |
| addNotification | `function` | Enqueues toast from notification object |
| clearAllToasts | `function` | Clears all active toasts |

**Implementation Details:**

When the module mounts, it creates an abort controller for the ROI service call so navigation away cancels work in flight. On teardown it clears all Redux slices and clears toasts so the next entry does not inherit stale ROI data or errors.

The container reads the `videoId` query parameter. When it is missing, the software queues a synthetic error notification with a stable identifier instead of calling the network. When it is present, the sender-gated fetch toggles loading in the videos slice, routes failures through the shared API error dialog with optional retry, and writes the transformed payload into centralized state on success.

The layout branch is simple: if centralized state holds an ROI video, the viewer child receives it; otherwise the shared empty player frame shows either a loading phrase or a generic failure phrase. A slim footer under both branches carries the adjunctive regulatory sentence.

A separate effect walks any queued notifications from state and registers each with the toast hook, wiring close actions back into the slice. Receiver builds clear toasts when those effects clean up so mirrored sessions do not leave stale banners.

**Status Outcomes:**

**Success:**

• ROI video payload stored and DICOM ROI video viewer shown

• Loading placeholder shown until fetch completes

**Error:**

• Persistent error notification when the query string lacks a video identifier

• API error modal with optional retry when the ROI video service fails

• In-player “Unable to render DICOM video” message when loading finishes without a payload

### 8.5.1.b DICOM ROI video viewer

**Design Requirements:**

*(TBD — sourced from design inputs / DHF.)*

**Functional Requirement:**

Container component that orchestrates the stack DICOM viewport, measurement and overlay toolbar, ROI-specific seek controls, and the study label for the active ROI clip.

**Software Requirements:**

• The software shall render the DICOM cine stack for the ROI clip, manage play and seek, and disable seek interactions until the stack is ready.

• The software shall load and persist user annotations for the same recording through the shared annotation service pattern used elsewhere in the client.

• The software shall draw server-supplied ROI rectangles on the correct frames, lock them from editing, and tie their visibility to the segmentation overlay toggle.

• The software shall offer frame stepping that respects ROI-only navigation when the operator enables that mode.

• The software shall show ROI frame markers on the seekbar and user measurement markers separately.

**Triggered By:**

• Parent renders this unit when centralized ROI video data is available

• Operator use of playback, seek, measurement toolbar, ROI-only stepping, and overlay controls

**Dependencies:**

- **APIs:**
  - Get video annotations API — Retrieves saved measurements for the recording
  - Save video annotations API — Persists measurement edits for the recording
- **State:** Redux `player` slice for playback, tools, overlays, and annotation list

**Custom Hooks**

| Hook | Return value | Purpose |
|------|----------------|---------|
| usePlayer | Viewport API, seek refs, playback handlers | Owns DICOM stack, seekbar, and annotations |
| useRectangleROI | *(side effects only)* | Registers locked server ROI rectangles |
| useFrameNavigation | `onFrameChangeWithNavigation` | Seeks with ROI-only frame wrap-around |

**Inputs**

| Property | Type | Description |
|----------|------|-------------|
| currentVideo | `ROIVideoType` | ROI payload, DICOM path, and frame lists |
| getAnnotationsApiCall | `function` | Sender-gated annotation fetch wrapper |
| saveAnnotationsApiCall | `function` | Sender-gated annotation save wrapper |
| dicomPadding | `{ top: number; bottom: number }` | Viewport vertical padding for ROI layout |
| onDicomMetadataLoadFail | `(videoId, errorCode) => void` | Handler when DICOM metadata fails |
| dicomPlayerApi | `StackViewportApi \| null` | Live viewport API from player hook |
| roiAnnotations | `ROIAnnotationType[]` | Server ROI boxes per frame |
| showSegmentationOverlay | `boolean` | Whether ROI overlays stay visible |
| roiFrameIndexes | `number[]` | Indices for top seekbar markers |
| seekSpecificFramesOnly | `boolean` | ROI-only stepping when true |
| onSeekSpecificFramesOnlyChange | `(boolean) => void` | Toggles ROI-only stepping |
| onFrameChange | `function` | Base seek handler from player hook |

**Outputs**

| Property | Type | Description |
|----------|------|-------------|
| dicomPlayerApi | `StackViewportApi \| null` | Viewport API for tools and frames |
| viewportElementRef | `RefObject<HTMLDivElement>` | DOM mount for DICOM canvas |
| setIsPlaying | `(boolean) => void` | Starts or stops cine playback |
| onFrameChangeWithNavigation | `function` | Seeks with ROI wrap-around logic |
| seekbarDisabled | `boolean` | Disables seekbar until stack ready |
| trackRef | `RefObject<HTMLDivElement>` | Seekbar track DOM ref |
| thumbRef | `RefObject<HTMLDivElement>` | Seekbar thumb DOM ref |
| trackLineRef | `RefObject<HTMLDivElement>` | Seekbar line DOM ref |

**Implementation Details:**

The viewer composes the shared DICOM stack component with padding tuned for the ROI layout, then layers the measurement toolbar. A central player hook owns viewport construction, buffering state, annotation load and save through the injected API wrappers, zoom and pan synchronization with Redux, and seekbar refs. When the stack becomes ready, the hook enables the toolbar and seek interactions; until then the seek surface stays disabled.

After the viewport API exists, a dedicated effect registers the passive rectangle ROI tool, projects each server ROI from image space into world space for the current viewport, pushes those shapes into the annotation layer, and locks them. Another effect watches the segmentation overlay flag and shows or hides only the ROI annotation identifiers so the operator can clear visual clutter without removing measurements.

The footer strip combines ROI-specific seek options with the shared seekbar. A checkbox gates whether frame advance jumps only among ROI frames; the frame number control calls into that policy through a navigation helper that wraps the base seek handler. The seekbar draws top markers on ROI indices with the ROI accent color and bottom markers on frames that carry user measurements, so two different cues remain distinguishable during review.

Beside the stack, a compact title block repeats the instance-oriented label and acquisition timestamp drawn from the ROI payload so the operator can confirm they are on the intended clip.

**Status Outcomes:**

**Success:**

• DICOM cine stack ready with playback, measurements, and locked ROI overlays visible

• ROI-only stepping and seekbar markers reflect server ROI frames and user measurements

**Error:**

• API error modal with optional retry when annotation load or save fails

• DICOM metadata or stack load failure surfaced through shared player error handling

**Child Components:** DICOM stack (`DicomPlayer`), measurement toolbar (`DicomToolbar`), ROI seek footer (`PlayerFooter`, `ROISeekbarOptions`), study label (`ROIVideoLabel`).
