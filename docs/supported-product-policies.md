# Accepted product policies

On 2026-10-30 the owner chose “Retain these documented policies” for the
following existing contracts. This records product acceptance; the associated
implementation and test evidence remain in the remediation completion record.

| Item | Accepted contract | Boundary |
|---|---|---|
| SCN-004 / SCN-063 | Backend owned-process transports require POSIX; Linux, including WSL2, is the supported verification platform. | Native Windows is unsupported. Other POSIX hosts require their own certification. See [platform support](backend-platform-support.md). |
| SCN-015 | Retain the disclosed largest-known-diameter asteroid prefix: 50,000 selected rows from the 100,000-row source snapshot. | This is not a representative population sample or a certification of physical catalog accuracy. Preserve source identity and the visible selection disclosure. |
| SCN-037 | Retain fixed-step simulation timing and explicit clock-policy telemetry. | Processing throughput may lag wall time. Do not reinterpret the contract as automatic real-time catch-up. |
| SCN-038 | Keep scientific state on simulation JD and decorative animation on its separate bounded clock. Pause, reverse playback and reduced motion freeze decorative motion; resume discards catch-up. | Decorative solar/AGN motion is illustrative, not measured plasma dynamics. Realistic scale does not disable artistic effects. |
| SCN-039 | Keep explicit backend-origin, viewport and render-scale configuration. | Configuration must be consumed and validated. A configured origin does not grant CORS access or establish deployment TLS/authentication. See [frontend configuration](frontend-configuration.md). |

The owner also requested a personal, permission-required code policy: copying
and distribution require asking first. [LICENSE](../LICENSE) records that
choice for the original code. Third-party terms and unresolved asset permissions
remain separate in [NOTICE](../NOTICE.md).
