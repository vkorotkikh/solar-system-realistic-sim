# Enterprise Vector Database Platform — Unified Design & Implementation Prompt

## System Role

You are a Principal Enterprise Search/AI Infrastructure Architect with deep expertise in distributed systems, vector databases, information retrieval, and production infrastructure. You design systems that are secure, scalable, observable, and operationally maintainable. You produce production-grade code with comprehensive error handling, observability, and operational tooling. You follow SOLID principles, write idiomatic code for the target language, and prioritize reliability and security over feature breadth. Correctness comes before performance; performance comes before convenience. All designs must be justified with explicit tradeoff analysis. Do not propose unsupported assumptions — state unknowns clearly.

---

## Objective

Design and implement a production-ready, enterprise-grade vector database platform — covering architecture, implementation, and operational model — that can be dropped into existing pipelines with minimal changes.

The platform must support:
- Standard RAG pipeline ingestion and retrieval
- Agentic RAG workflows with tool-calling and chain-of-thought-aware retrieval constraints
- Semantic search and recommendation systems
- Future workloads requiring graph-like metadata joins, filters, and re-ranking
- General-purpose ANN similarity workloads

---

## Environment Inputs

Fill in these parameters to contextualize the design. If unknown, state "TBD" and document the assumptions made in their absence.

- **Current stack**: cloud provider(s), runtime/orchestration (K8s, ECS, bare metal), language runtimes, incumbent vector DB (if any), object store, message bus, observability stack
- **Traffic profile**: search QPS (sustained and burst), documents ingested per day, average document/chunk size, average query shape (top-k, dimensions)
- **SLA targets**: search latency p95 and p99, availability target, recovery point objective (RPO), recovery time objective (RTO)
- **Compliance requirements**: SOC2 / ISO 27001 / HIPAA / GDPR / FedRAMP / region restrictions
- **Data sensitivity**: PII, PHI, private documents, classified, public only
- **Budget constraints**: monthly cost ceiling, preferred cloud provider, expected 12-month growth
- **Team context**: team size, on-call model, operational maturity level

---

## 1. Core Engine

### Distance Metrics
- Required: cosine, euclidean (L2), dot product
- Optional: Manhattan, Hamming
- Configurable per collection at creation time

### Indexing
- Primary algorithm: HNSW. Secondary: IVF-PQ, flat/brute-force
- Index strategy configurable per collection. Flat index as fallback for small collections
- Background async index building that does not block reads or writes
- Index build progress exposed via metrics and admin API
- Define explicit on-disk storage layout with file format versioning for forward compatibility

### Dimensionality
- Support 64 to 4096+ dimensions
- Must handle OpenAI (1536/3072), Cohere (1024), and open-source models (384–4096) without recompilation or restart

### CRUD Operations
- Single: insert, upsert, get by ID, update, delete
- Batch: batch insert, batch upsert, batch delete — up to 100K items per call
- Batch operations report per-item success/failure with partial failure semantics
- All write operations support idempotency keys. Retrying with the same key must not create duplicates. Define idempotency window (e.g., 24 hours)
- Deletes create tombstone markers excluded from search immediately. Physical deletion during compaction. Tombstone retention configurable (default 72 hours)

### Filtering
- Pre-filter (default) and post-filter approaches
- Operators: AND, OR, NOT, IN, NOT_IN, RANGE, EQ, NEQ, GT, GTE, LT, LTE, EXISTS, CONTAINS
- Composable via nested boolean logic on arbitrary metadata fields
- Support optional graph-like metadata joins for future workloads (e.g., find chunks whose parent document has department = "engineering"). Define the query syntax and execution model

### Hybrid Search
- Dense vector similarity (ANN) + sparse BM25 keyword scoring
- Fusion strategies: reciprocal rank fusion, weighted linear combination — configurable per query
- Optional server-side reranking pass (cross-encoder or custom model) after fusion
- Hybrid search expressible as a single API call

### Embedding Lifecycle
- **Chunking contract**: DB accepts pre-chunked content but stores chunk metadata (source_document_id, chunk_index, chunk_overlap_tokens) to support re-assembly and re-chunking
- **Model tracking**: Store embedding_model_id and embedding_model_version per vector to support re-embedding when models change
- **Re-embedding**: Support bulk re-embedding workflows — query documents with old model versions, export content, accept updated vectors via batch upsert. Old vectors remain searchable until replaced. Define the state machine
- **Deduplication**: Optional content-hash-based dedup at ingest. If a document with the same content_hash exists, skip insertion and return existing ID. Configurable per collection

---

## 2. Data Model

### Collections
- Properties: name, vector_dimensions, distance_metric, index_type, replication_factor, sharding_strategy, embedding_model_id, embedding_model_version
- Collections are the top-level namespace. Schema defined at creation with non-breaking evolution

### Documents
- **id**: UUID auto-generated or user-supplied string
- **vectors**: map of named vector fields (e.g., title_embedding, body_embedding). Primary required; additional optional. Precision: float32, float16, binary quantized
- **metadata**: JSON object (string, integer, float, boolean, string_array, datetime). Indexed on demand. Add/remove indexes without downtime
- **Reserved metadata fields**: source_document_id, chunk_index, chunk_overlap_tokens, content_hash, embedding_model_id, embedding_model_version, ingested_at (auto), updated_at (auto)
- **content**: optional raw text payload for direct RAG retrieval without secondary store
- **token_count**: optional pre-computed token count for context-window-aware retrieval

### Schema Governance
- Enforce all vectors in a collection share the same dimensionality. Reject mismatched dimensions at ingest with clear error
- Metadata schema registry per collection validates incoming metadata against declared types. Enforce naming conventions (snake_case, max length, allowed characters)
- Tenancy and namespace boundaries enforced at storage and query engine level — a query scoped to tenant A must never touch tenant B's data pages
- All mutations carry system-populated, immutable audit fields (actor_id, timestamp, operation, collection, document_id, tenant_id, source_ip, idempotency_key) stored in a separate audit log
- Schema evolution: add/remove metadata indexes, add named vector fields, update collection settings — all online, no downtime, no full rebuild

---

## 3. Scalability & Distribution

### Sharding
- Consistent hashing or range-based partitioning, transparent to clients. Router/coordinator handles shard resolution

### Replication
- Configurable factor (1–5). Leader-follower or leaderless quorum
- Per-operation consistency: strong (quorum write + quorum read) or eventual (single-node read)
- Document exact consistency model. Define what "read-your-writes" means. Specify whether a search immediately after upsert is guaranteed to include the new vector

### Cluster Management
- Dynamic membership: add/remove nodes without downtime
- Background rebalancing with configurable throughput limits to avoid impacting query latency

### Scale Targets
- Derived from the environment inputs (traffic profile + SLA targets)
- Include a sizing calculator: (vector count, dimensions, QPS, latency target) → (node count, memory, disk, network)
- Provide reference benchmarks at 1M, 10M, 100M, and 1B vector scales

---

## 4. Persistence & Durability

### Write-Ahead Log
- WAL for all mutations. Configurable fsync: per-write, batched (N writes), or periodic (N ms)
- WAL segments replicated before acknowledging writes in strong consistency mode

### Storage
- Disk-backed with memory-mapped index files
- Must NOT require entire index in RAM. Graceful performance degradation when working set exceeds memory
- Tiered storage: hot (local NVMe, indexed, <50ms), warm (network storage, indexed, <200ms), cold (object store, not indexed, seconds), archived (object store, restore required, minutes). Tier transitions are policy-driven and automated

### Compaction
- Background compaction (size-tiered or leveled). Must not degrade query latency by more than 10% during execution

### Snapshots
- Point-in-time snapshots to local filesystem or S3-compatible object store. Must be consistent (no partial writes captured)

---

## 5. Multi-Tenancy

### Isolation
- Two models: collection-per-tenant (stronger isolation) and metadata partition key (more resource-efficient). Support both. Document tradeoffs

### Quotas
- Configurable limits: max vectors, max QPS, max storage, max collections, max concurrent queries
- Hard enforcement with clear errors (HTTP 429 / gRPC RESOURCE_EXHAUSTED)
- Real-time enforcement (not eventually consistent). Quota dashboard and alerting when tenants approach limits

### Data Isolation
- CRITICAL: A tenant's queries must NEVER return another tenant's data. Enforced at the engine level, not just API. Include integration tests verifying isolation under concurrent load

---

## 6. API Design

### Protocols
- Primary: gRPC (performance-critical search and bulk operations)
- Secondary: REST/HTTP (broad compatibility, admin UIs, webhooks)

### Endpoints
- Collection management: create, get, list, update, delete
- Document operations: insert, upsert, get, update, delete, batch insert, batch upsert, batch delete
- Search: query, batch query, hybrid query
- Admin: health, readiness, cluster status, trigger compaction, trigger snapshot, trigger rebalance, rebuild index
- Streaming: stream insert for high-throughput bulk loads
- Governance: get schema, validate metadata, get quota usage

### API Contract
- Idempotency-Key header on all mutating endpoints. Repeated calls within window return original response
- Cursor-based pagination (opaque, stateless, URL-safe tokens). No offset pagination
- Consistency level parameter on search: "strong" or "eventual" (default)
- Structured error body: { code, message, details, request_id, trace_id }. Stable, documented error codes

### Schema Artifacts
- Ship .proto files as versioned artifacts
- Auto-generate OpenAPI 3.1 spec with sample request/response payloads
- Both source-controlled and published with every release

### Client SDKs
- Required: Python, TypeScript/Node, Go, Rust
- Idiomatic per language (async/await, channels, etc.)
- Auto-generated gRPC stubs with hand-written ergonomic wrappers
- Connection pooling, retry with exponential backoff and jitter, circuit breaker
- Type-safe builder pattern for filter expressions

---

## 7. Security

### Authentication
- API key (service-to-service), JWT, OAuth2, mTLS client certs
- Enterprise IAM integration: OIDC (Okta, Azure AD, Auth0), SAML for legacy SSO, LDAP/AD for on-prem. Pluggable provider interface — never hardcode a specific IdP

### Authorization
- RBAC with optional ABAC extensions
- Roles: super_admin (cluster-wide), tenant_admin (full within tenant), read_write, read_only, ingestion_service (write-only, cannot read back)
- Scoped to tenant + collection(s). No implicit global access
- Policy-as-code (OPA/Rego or Cedar) for fine-grained rules beyond static RBAC

### Transport
- mTLS for all inter-node communication. TLS 1.3 for client-to-node
- Automatic certificate rotation via cert-manager or Vault PKI

### Encryption at Rest
- AES-256-GCM with envelope encryption
- Key management: local keyfile, AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault
- BYOK supported. Key rotation without re-encryption of existing data

### Field-Level Security
- Redaction policies: fields redacted based on role (enforced at query engine, not API gateway)
- Dynamic data masking for sensitive metadata (PII). Per-field per-role rules. Returns deterministic hash or "[REDACTED]"

### Audit Logging
- Events: all mutations, admin operations, auth failures, schema changes, policy changes, search queries (optional)
- Fields: timestamp, actor_id, tenant_id, action, resource, result, source_ip, request_id, trace_id
- Append-only, tamper-evident. Forward to external SIEM (syslog, webhook, Kafka). Retained independently of data lifecycle
- Anomaly detection alerts: query spikes, bulk deletions, new IP ranges, auth failure thresholds

---

## 8. Observability

### Metrics (Prometheus / OpenTelemetry)
- Query latency histogram (p50/p95/p99) by collection and query type
- QPS by collection and query type
- Ingestion rate (docs/sec)
- Index build progress, memory usage (heap/mmap/cache), disk usage (data/WAL/snapshots)
- WAL size and lag, replication lag per replica
- Active connections by protocol, cache hit ratio
- Compaction progress and duration, tenant quota utilization, error rate by code

### Logging
- Structured JSON. Configurable per-module log levels at runtime without restart
- All entries include request_id and trace_id for correlation

### Health Checks (Kubernetes-native)
- Liveness: process running
- Readiness: can serve queries (index loaded, cluster joined, replication caught up)
- Startup: initial index loading and WAL replay complete (prevents premature traffic)

### Tracing (OpenTelemetry)
- Propagate trace context across all inter-node RPCs
- Spans for: query parsing, filter evaluation, ANN search, result merging, reranking, WAL write, replication

### Dashboards & SLOs
- Dashboard definitions (Grafana JSON or equivalent): cluster overview, per-collection deep-dive, per-tenant usage, operational health
- SLO targets derived from environment inputs. Error budget policy: freeze deployments when exhausted. Burn-rate alerting (fast-burn → page, slow-burn → ticket)
- Synthetic monitors: search and ingest probes every 60s against a canary collection. Alert if latency exceeds 2x p99 SLO or probes fail consecutively

---

## 9. RAG & Agentic Integration

### Metadata-Driven Retrieval
- Support compound filter patterns: document_id=X AND uploaded_after=2024-01-01 AND tags IN ['architecture', 'api'] AND similarity > 0.75

### MMR Diversification
- Built-in Maximal Marginal Relevance. Caller specifies mmr_lambda (0.0–1.0, default 0.5) for diversity vs relevance tradeoff. Applied server-side

### Score Thresholding
- min_score parameter on search. Only return results above threshold. Do NOT return all and expect caller to filter

### Context Window Awareness
- Optional max_tokens budget on search. Return as many results as fit using stored token_count. Ordered by relevance; lowest-ranked dropped first

### Reranking
- Three approaches: two-stage retrieve-then-rerank (single API call with oversample_factor), native reranker plugin (server-side cross-encoder), raw scores for client-side reranking. Support all three

### Agentic Memory
- Per-session/per-agent partitions via metadata partition keys with TTL for automatic stale memory purge
- Parameters: session_id (partition key), ttl_seconds (auto-expiry)

### Chain-of-Thought Constraints
- Query-time parameters for agentic reasoning: exclude_ids (skip already-cited documents), boost_filter (boost documents from same source as last retrieved chunk). Query parameters, not index-time config

---

## 10. Data Lifecycle & Governance

### TTL
- Per-document and per-collection. Background expiration. Excluded from search immediately; physically deleted during compaction

### Retention & Archival
- Per-collection retention policies with tier transitions: hot → warm → cold → archived → purged
- Archived data queryable with higher latency (restored from object store). Purged data irrecoverable

### Legal Hold
- Flag on documents/collections preventing deletion regardless of TTL or retention. Applied/released via admin API with audit logging. Required for GDPR litigation hold and eDiscovery

### GDPR Purge (Right to Erasure)
- Given a source_document_id or tenant_id, permanently delete all associated vectors, metadata, content, and audit references (or pseudonymize audit entries). Return a deletion certificate (affected count + timestamp). Propagate to all replicas and backups within configurable window

### Data Lineage
- Track: source_system → source_document → chunk → embedding_model:version → vector
- Lineage queryable via admin API. Enables impact analysis when a model is deprecated or source document retracted

### Versioning
- Optional document version history. Configurable max_versions. Rollback to specific version. Version history purgeable independently. Default: disabled

### Dataset Versioning
- Tag a collection's state as a named immutable snapshot (like git tags). Used for reproducibility in ML/evaluation workflows. Support querying against a specific dataset version

### Bulk Export
- Parquet, JSONL. Streaming export for large collections. Includes vectors, metadata, content. Respects field-level redaction

### Bulk Import
- Parquet, JSONL, CSV. Progress reporting, validation, configurable error handling (skip_invalid | fail_fast)

---

## 11. Deployment & Operations

### Packaging
- Single statically-linked binary for single-node mode. Zero external dependencies. Download-and-run
- Docker: multi-stage build, final image <100MB, non-root, distroless/alpine
- Helm chart: configurable replicas, resources, storage class, ingress, TLS, affinity
- IaC modules (Terraform/Pulumi): compute, storage, networking, IAM, KMS, monitoring. Parameterized for single-region and multi-region

### Configuration
- Sources: YAML, TOML, environment variables, CLI flags
- Precedence: CLI > env > config file > defaults
- Every option documented with type, default, description, and restart requirement
- Config validation command for pre-startup checks

### Deployment Strategies
- **Rolling** (default): one node at a time, readiness check before next, auto-rollback on timeout
- **Blue/green**: for major versions. Both clusters run simultaneously. Verification checklist before cutover. Defined rollback procedure
- **Canary**: configurable traffic percentage (e.g., 5%). Auto-promote if metrics within SLO for N minutes; auto-rollback on threshold breach

### High Availability
- **Single region**: 3+ nodes across 3 AZs. Quorum writes survive 1 AZ failure. Reads available during single-node failure
- **Multi-region**: active-passive (async replication, RPO per SLA) and active-active (conflict resolution: last-writer-wins with vector clock, or region-primary). Document latency/consistency tradeoffs
- **Failover**: automatic leader failover within region (<30s). Cross-region manual by default (operator confirmation). Split-brain prevention documented

### Backup & Disaster Recovery
- Automated snapshots on configurable schedule (e.g., every 6 hours). Stored in separate fault domain
- Restore to new cluster or in-place. Estimated restore time based on dataset size
- DR restore test cadence (e.g., monthly): automated spin-up → restore → validation (record count, sample queries, checksum) → tear down → report. Tracked in compliance dashboard

### Graceful Shutdown
- SIGTERM → stop accepting connections → drain in-flight (30s default) → flush WAL → snapshot → deregister from cluster → exit

### Upgrades
- Rolling with zero downtime. Wire protocol N and N-1 compatible
- Forward-compatible data format. Automatic migration on startup. Migration progress logged and metriced

### Operational Playbooks
- **Scale up**: provision → join cluster → verify rebalance → validate latency → update capacity plan. Expected duration per node
- **Scale down**: drain node → verify shards relocated → remove from cluster → decommission. Safety: don't go below quorum or replication factor
- **Incident triage**: decision-tree runbook. Symptom → likely cause → diagnostic commands → remediation. Covers: high latency, error spikes, replication lag, disk full, OOM, split-brain, index corruption, cert expiry
- **Corruption recovery**: detect (checksum mismatch) → isolate node → rebuild from WAL + replicas → verify recall → rejoin. Max acceptable data loss window defined
- **Reindex**: build new index in background → swap atomically → verify recall → delete old. No availability impact
- **On-call escalation**: L1 (automated/self-healing) → L2 (on-call, 15-min response) → L3 (senior engineer, architecture) → L4 (vendor). Alert-to-tier mapping. PagerDuty integration points

---

## 12. Performance & Optimization

### Quantization
- Scalar: float32 → int8 (4x memory reduction, ~2-5% recall loss)
- Product: PQ with configurable sub-quantizers
- Binary: 1-bit for candidate pre-filtering
- Configurable per collection. Re-quantization without full re-index

### Caching
- LRU or clock cache for hot vectors and metadata. Configurable size. Cache hit ratio as metric
- Invalidation consistent with write path (no stale reads after acknowledged writes in strong mode)

### SIMD
- Distance computations use SIMD intrinsics: AVX2, AVX-512 (x86), NEON (ARM). Runtime detection with scalar fallback

### I/O Optimization
- Batch disk reads for batch queries. io_uring (Linux) or equivalent async I/O where available

### Benchmark Methodology
- Reproducible: fixed dataset (ANN-benchmarks suite), fixed hardware, fixed config
- Metrics: recall@k, QPS, latency (p50/p95/p99), memory footprint, disk footprint, index build time
- Recall targets: recall@10 >= 0.95, recall@100 >= 0.99 with HNSW defaults. Define the recall/latency tradeoff curve
- Load test scenarios: sustained 1x for 24h, burst 10x for 15min, mixed R/W ratios, 72h soak. Pass criteria: max p99, max error rate, RSS growth <5% over soak

---

## 13. Testing & Quality

### Recall Benchmarks
- Measure recall@k vs brute-force at 1M, 10M, 100M vectors. Publish with every release including hardware specs

### Chaos Testing
- Scenarios: node failure during write, node failure during index build, network partition (split-brain), disk full, OOM kill, clock skew, slow network (latency injection), certificate expiry mid-operation
- All must result in correct behavior (no data loss, no silent corruption). Run weekly in staging

### Load Testing
- Built-in harness. Configurable R/W ratio, concurrency, dataset size, duration. Outputs latency histograms and throughput. Includes baseline profiles for reference hardware

### Property Testing
- Fuzz insert/update/delete/search sequences. After any mutation sequence, brute-force search must match ANN with recall@10 >= 0.95

### Cross-Tenant Isolation Tests
- Create N tenants, ingest unique data, run concurrent searches verifying zero cross-tenant leakage. Run under load

### CI/CD Pipeline
- Stages: lint → unit test → integration test → cross-tenant isolation → benchmark (gated on regression) → chaos (nightly) → build → security scan (SAST + dependency audit) → publish
- Policy checks: no known CVEs, all public APIs tested, no secrets in codebase (trufflehog/gitleaks), Docker image passes Trivy scan

---

## 14. Compliance & Security Checklist

Provide an explicit compliance matrix mapping each requirement to the system feature that satisfies it.

### SOC2 Type II
- Access control (CC6.1), encryption (CC6.7), monitoring (CC7.1), change management (CC8.1), incident response (CC7.3)

### GDPR
- Right to erasure (Art. 17), data portability (Art. 20), privacy by design (Art. 25), processing records (Art. 30), breach notification (Art. 33)

### HIPAA (if applicable)
- Access controls (§164.312(a)), audit controls (§164.312(b)), integrity controls (§164.312(c)), transmission security (§164.312(e)). Field-level encryption of PHI

### ISO 27001 (if applicable)
- Annex A mapping: asset management (A.8), access control (A.9), cryptography (A.10), operations security (A.12), system acquisition (A.14)

---

## 15. Migration

### Initial Bootstrap
- Bulk import from: flat files (Parquet/JSONL), existing vector DBs (Pinecone, Qdrant, Milvus, Weaviate, pgvector), Elasticsearch
- Flow: extraction → validation → transformation → parallel loading → index building → verification (record count + sample recall check)

### Rolling Migration (Zero Downtime)
1. Dual-write: new writes go to both old and new systems
2. Backfill historical data
3. Shadow reads: query both, compare results, log discrepancies
4. Cutover reads to new system
5. Decommission old system
- Each phase has explicit entry/exit criteria and rollback procedures

### Rollback Strategy
- Defined at every migration phase. Rollback tested as part of the plan, not just documented. Maximum acceptable rollback time specified

---

## 16. Sizing & Cost Model

- Calculator inputs: vector count, dimensions, avg metadata size, avg content size, search QPS, ingest QPS, latency target p99, replication factor, retention days
- Calculator outputs: node count, vCPU/node, memory/node, disk/node, network bandwidth, estimated monthly cost
- Reference profiles:
  - Small: 10M vectors, 1536d, 100 QPS, 3 nodes
  - Medium: 100M vectors, 1536d, 1000 QPS, 9 nodes
  - Large: 1B vectors, 1536d, 5000 QPS, 30+ nodes
- Cost projections at 1x, 3x, and 10x scale for each profile on the target cloud

---

## Constraints

- Prioritize reliability and security over feature breadth
- Avoid vendor lock-in: recommend abstraction layers for cloud-specific services. Document migration path for each cloud dependency
- Keep operational complexity proportional to throughput and team size. A 3-person team must be able to operate this without dedicated SRE staffing
- Prefer deterministic, debuggable behavior over opaque settings. Every tunable has a documented effect and sensible default
- Language: Rust or Go (justify based on tradeoffs)
- License: Apache-2.0
- Test coverage: 80% line coverage for core engine, 95% for API layer
- Must NOT wrap an existing vector database (no embedding Qdrant, Milvus, FAISS as core). Purpose-built
- Wire protocol and data format backward compatible within a major version
- State unknowns explicitly. Define what decision resolves each

---

## Required Output Format

Structure the response with these sections. All are mandatory.

1. **Assumptions** — Every assumption stated explicitly. For each: what changes if the assumption is wrong
2. **Executive Summary** — One page for engineering leadership. Problem, solution, key tradeoffs, expected outcomes
3. **Architecture Overview** — Component diagram (textual OK). Data flow for ingest and query. Technology choices with justification
4. **Component Design** — Detailed: coordinator/router, storage engine, index engine, WAL, replication manager, query executor, metadata store, cache layer, admin service
5. **API Contract** — OpenAPI-style definitions with sample request/response payloads. Protobuf messages for gRPC
6. **Security & Compliance** — Security architecture, threat model, compliance matrix, hardening checklist
7. **Operations** — Deployment model, HA topology, backup/DR, dashboards, SLO policy, all playbooks
8. **Performance & Quality** — Benchmark methodology, recall/precision targets, load test plan, acceptance criteria with pass/fail
9. **Data Governance** — Retention, archival, legal hold, GDPR purge, lineage, dataset versioning
10. **Migration & Rollout** — Bootstrap, rolling migration, rollback, deployment phasing
11. **Sizing & Cost** — Calculator, reference profiles, cost projections
12. **Implementation Artifacts** — Source code by module, Dockerfile, Helm chart, IaC modules, CI/CD pipeline, Makefile
13. **Risks & Mitigations** — Each risk with probability, impact, and mitigation
14. **Open Questions** — Unresolved items requiring stakeholder input
15. **Roadmap** — 90-day implementation phases with timeline, ownership matrix, milestone definitions, and phase gates

### Non-Functional Acceptance Criteria (Appendix)

Each criterion must specify: description, measurement method, target threshold, and pass/fail definition.

Examples:
- Search latency p99 < {sla_target} ms at {traffic_profile.search_qps} QPS
- Recall@10 >= 0.95 on ANN-benchmarks sift-128-euclidean
- Zero cross-tenant data leakage under 10-tenant concurrent load test
- Successful DR restore within {sla_target.rto} from latest snapshot
- Rolling upgrade completes with zero dropped queries
- GDPR purge completes within 24 hours for any single tenant
