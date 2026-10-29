import type { ChapterPlanInput } from "./types";
import { parseBatchSource } from "./batch-source";

export const AUDIT_SUBJECT = {
  name: "Audit",
  teacher: "CA Final — Regular Batch",
  color: "amber",
  defaultHoursPerLecture: 1.25,
  appTitle: "CA Final Audit Regular Batch Planner",
};

const AUDIT_SOURCE = `
## ~Instructions
#! All conceptual doubts on @adsupportstaff on Telegram
#! Revise after every class (concepts & questions)
#! Give tests with classes for full confidence (Tests details in Google Drive)
## Basic
D1P1 1:34:09
D1P2 0:44:51
D2P1 0:09:50
D2P2 1:18:57
D2P3 0:51:08
D3P1 1:10:46
D3P2 0:21:18
## SQC 1
D4P1 1:35:16
D4P2 1:05:31
D5P1 1:31:55
D5P2 0:58:41
D6P1 1:23:01
D6P2 0:25:45
## SA 250
D7P1 1:18:35
D7P2 1:08:44
## SA 260
D8P1 1:31:35
D8P2 0:57:19
## SA 299
D9P1 1:18:53
D9P2 0:43:34
@@ Test-1 (SQC-1, SA 250, 260, 299)
## SA 240
D10P1 1:30:50
D10P2 1:03:28
D11P1 1:35:21
D11P2 1:00:17
D12P1 1:36:31
D12P2 0:09:42
## SA 550
D13P1 1:32:20
D13P2 0:59:39
@@ Test-2 (SA 240, 550)
## SA 500, 501, 505, 510, 560
D14P1 (SA 500) 1:31:30
D14P2 (SA 501) 1:02:12
D15P1 (SA 501) 1:32:10
D15P2 (SA 505) 0:58:01
D16P1 (SA 505) 1:29:44
D16P2 (SA 510) 1:12:21
D17P1 (SA 560) 1:39:25
D17P2 (SA 560) 0:46:36
@@ Test 3 (SA 500, 501, 505, 510, 560)
## SA 265, 570, 580, 320, 530, 450
D18P1 (SA 265) 1:22:53
D18P2 (SA 265) 0:38:59
D18P3 (Case Study) 0:53:34
D19P1 (SA 570) 1:23:19
D19P2 (SA 570) 1:01:45
D20P1 (SA 570) 1:42:21
D20P2 (SA 570) 1:03:27
D21P1 (SA 580) 1:30:14
D21P2 (SA 570 Correction) 0:02:03
D22P1 (SA 320) 1:36:52
D22P2 (SA 530) 0:43:18
D23P1 (SA 530) 1:04:32
D23P2 (SA 450) 1:37:17
@@ Test 4 (SA 265, 570, 580, 320, 530, 450)
## SA 700 Series & Company Audit
D24P1 (SA 700) 1:39:54
D24P2 (SA 701) 0:57:18
D25P1 (SA 705) 1:35:14
D25P2 (SA 705) 1:00:55
D26P1 (SA 706) 1:36:24
D26P2 (SA 710) 1:18:55
D27P1 (SA 720) 1:01:14
D27P2 (Company Audit) 1:30:59
@@ Test 5 (SA 700 Series + Co. Audit)
## CARO 2020
D28P1 1:33:28
D28P2 0:54:37
D29P1 1:32:10
D29P2 0:28:05
@@ Test 6 (CARO 2020 Assignment)
## SA 620 & Professional Ethics
D30P1 (SA 620) 1:31:06
D30P2 (SA 620) 0:57:17
D31P1 (Professional Ethics) 1:35:00
D31P2 (Professional Ethics) 0:53:36
D32P1 (Professional Ethics) 1:23:53
D32P1a (Professional Ethics) 0:19:05
D32P2 (Professional Ethics) 0:46:53
D33P1 (Professional Ethics) 1:49:32
D33P2 (Professional Ethics) 0:45:47
D34P1 (Professional Ethics) 1:40:24
D34P2 (Professional Ethics) 0:41:46
D34P3 (Professional Ethics) 0:11:46
D35P1 (Professional Ethics) 1:28:25
D35P2 (Professional Ethics) 1:08:37
D36P1 (Professional Ethics) 1:35:03
D36P2 (Professional Ethics) 1:07:06
D37P1 (Professional Ethics) 1:31:33
D37P2 (Professional Ethics) 1:04:07
D38P1 (Professional Ethics) 1:22:56
D38P2 (Professional Ethics) 0:47:00
@@ Test 7 (Professional Ethics)
## SA 540, SA 402, SAE 3402, SA 520, NBFC, Group Audit & SA 600
D39P1 (SA 540) 1:28:03
D39P2 (SA 540) 1:14:12
D40P1 (SA 402) 1:26:15
D40P2 (SA 402) 0:52:32
D41P1 (SAE 3402) 1:34:00
D41P2 (SA 520) 0:46:19
D42P1 (NBFC) 1:27:28
D42P2 (NBFC) 1:19:37
D43P1 (NBFC) 1:24:28
D43P2 (NBFC) 1:03:53
D44P1 (Group Audit) 1:29:37
D44P2 (Group Audit) 0:46:02
D45P1 (Group Audit) 1:17:37
D45P2a (SA 600) 1:23:38
D45P2b (SA 600) 0:13:07
@@ Test 9 (NBFC, Group Audit, SA 600) — Test 8 is not listed in the source document
## ESG, Internal Audit, SA 610 & SA 800 Series
D46P1 (ESG) 1:29:22
D46P2 (ESG) 1:33:33
D46P3 (ESG Case Study) 0:18:25
D47P1 (Internal Audit) 1:39:35
D47P2 (Internal Audit) 0:49:26
D48P1 (Internal Audit) 1:08:00
D48P2 (Internal Audit) 0:32:34
D48P3 (SA 610) 1:34:29
D48P4 (SA 610) 0:42:08
D49P1 (SA 800) 1:30:16
D49P2 (SA 805) 0:58:50
D50P1 (SA 805) 0:58:19
D50P2a (SA 810) 0:53:19
D50P2b (SA 810) 1:06:40
@@ Test 10 (Internal Audit + SA 610 + SA 800 Series + ESG/SDGs)
## SRE, SAE & SRS
D51P1 (SRE 2400) 1:42:56
D51P2 (SRE 2400) 0:42:41
D51P3 (SRE 2400) 0:46:20
D52P1 (SRE 2410) 1:24:07
D52P2 (SRE 2410) 0:50:54
D53P1 (SAE 3400) 1:31:19
D53P2 (SAE 3420) 1:13:13
D54P1 (SRS 4400) 1:02:44
D54P2 (SRS 4410) 1:35:13
@@ Test 11 (SAE, SRE, SRS)
## Audit Plan, PSU, Due Diligence, Forensic & Bank Audit
D55P1 (Audit Plan) 1:16:52
D55P2 (Audit Plan) 1:00:32
D56P1 (PSU) 1:27:59
D56P2 (PSU) 1:05:29
D57P1 (PSU) 1:21:27
D57P2 (PSU) 0:45:00
D58P1 (Due Diligence) 1:25:10
D58P2 (Due Diligence) 0:48:08
D59P1 (Forensic) 1:44:48
D60P1 (Bank Audit) 1:31:13
D60P2 (Bank Audit) 1:18:43
D61P1 (Bank Audit) 1:27:12
D61P2 (Bank Audit) 0:50:03
D62P1 (Bank Audit) 1:23:22
D62P2 (Bank Audit) 1:12:21
D63P1 (Bank Audit) 0:21:39
D63P2 (Bank Audit) 0:48:39
D63P3 (Bank Audit) 0:34:46
D63P4 (Bank Audit) 0:12:11
@@ Test 12 (DD, FA, PSU, Bank Audit)
## RAIC, Investigation & Digital Audit
D64P1 (RAIC) 1:41:03
D64P2 (RAIC) 1:01:27
D65P1 (RAIC) 1:24:59
D65P2 (RAIC) 0:52:33
D66P1 (Investigation) 1:34:11
D66P2 (Investigation) 0:32:03
D67P1 (Investigation) 1:34:06
D67P2 (Investigation) 0:32:31
Additional Topic: Digital Audit — 5 videos in Google Drive, to be completed after 2-3 revisions of Audit with tests
`;

export const AUDIT_SEED: ChapterPlanInput[] = parseBatchSource(AUDIT_SOURCE);

/** Realistic starting progress so the app feels alive on first load. */
export const AUDIT_COMPLETED: Record<string, number> = {
  Basic: 4,
  "SQC 1": 3,
};
