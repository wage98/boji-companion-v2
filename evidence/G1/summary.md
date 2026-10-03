G1 HARNESS QUALIFICATION — IN PROGRESS

Imported V1 source is limited to the allowed-import manifest and matches the verified V1 live HEAD. The V1 .git directory was not copied. The two known official game assets, stale V1 install QR and derivative character preview are excluded with per-file reasons; V1 asset credits are preserved as audit evidence.

The first harness run reproduced the two qualified clean-clone failures: J15 and K8 had no generated reports. The harness now pins jsdom 28.1.0 and qrcode 1.5.4, removes machine-specific NODE_PATH, creates eval-set/ in both generators, and runs those generators explicitly before regression tests. F1/F2 select an actually seeded visible date. D1–D4 wait for observable states, with a 5 second D1 ceiling against the PRE-LUNA 983ms probe.

Five repeated local full-suite runs passed 251/251: three on local calendar day 2 via Pacific/Honolulu and two on local day 3 via Asia/Shanghai. Both generated report hashes were identical in each run. A fresh disposable clone install and test run remains required before G1 PASS.

Legacy product expectations remain unchanged during this harness-only gate. The H3 calories-to-macros expectation is classified as a legacy bug expectation for G4. Legacy Nahida/spider identity checks are obsolete under the frozen Boji identity; new tests must preserve the valid companion interaction classes and Photo Pet capability.
