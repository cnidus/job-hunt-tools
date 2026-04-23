-- ============================================================
-- Clockwork Research Hub — Seed Data
-- Run AFTER schema.sql
-- ============================================================

-- ── Intel Items ───────────────────────────────────────────────────────────
insert into intel_items (source, item_type, title, url, summary, published_at, tags) values

('news', 'announcement',
 'Clockwork raises $20.5M to synchronize GPU clusters and accelerate AI workloads',
 'https://siliconangle.com/2025/09/10/clockwork-raises-20-5m-synchronize-gpu-clusters-accelerate-ai-workloads/',
 'Clockwork closed $20.575M in fresh funding led by NEA, with participation from Intel CEO Lip-Bu Tan, former Cisco CEO John Chambers, and e& Capital. New CEO Suresh Vasudevan (former NetApp exec) hired to scale the AI infrastructure software business.',
 '2025-09-10 00:00:00+00',
 array['funding','leadership','fleetiq']),

('news', 'article',
 'Clockwork Helps GPUs Keep Busy',
 'https://www.futuriom.com/articles/news/clockwork-ios-moment-has-arrived/2025/09',
 'Futuriom analysis: Clockwork''s moment has arrived. Differentiates based on its combination of granular observability and rerouting, along with its software-only architecture supporting traffic across a broad range of network configurations.',
 '2025-09-01 00:00:00+00',
 array['analysis','competitive','fleetiq']),

('news', 'press_release',
 'Clockwork Launches FleetIQ — the Software Layer That Recasts GPU Economics',
 'https://www.accessnewswire.com/newsroom/en/computers-technology-and-internet/clockwork-launches-fleetiq-the-software-layer-that-recasts-gpu-ec-1070779',
 'FleetIQ delivers microsecond-level visibility and dynamic traffic control across heterogeneous GPU clusters. Optimizes performance, reliability, and energy efficiency. Enables enterprises, hyperscalers, and neoclouds to achieve higher GPU utilization and lower infrastructure costs.',
 '2025-09-10 00:00:00+00',
 array['fleetiq','product','launch']),

('news', 'article',
 'Clockwork raises $21M to keep server clocks in sync',
 'https://techcrunch.com/2022/03/16/clockwork-raises-21m-to-keep-server-clocks-in-sync/',
 'Early TechCrunch coverage of Clockwork''s initial raise and vision. Good background on founder story and original focus on clock synchronization as the foundation for their observability platform.',
 '2022-03-16 00:00:00+00',
 array['funding','history','founding']),

('clockwork_blog', 'article',
 'Clockwork Platform — FleetIQ Product Page',
 'https://clockwork.io/platform/',
 'Official product documentation for FleetIQ. Covers cross-stack observability, workload fault tolerance, and performance acceleration. Key technical reference for SE role.',
 '2025-01-01 00:00:00+00',
 array['product','technical','reference']),

('linkedin_manual', 'post',
 'Clockwork Systems LinkedIn Company Page',
 'https://www.linkedin.com/company/clockwork-systems-inc',
 'Follow for product announcements, hiring updates, executive posts, and customer stories. Check weekly — this is where Suresh Vasudevan and the team share strategic updates.',
 '2026-04-23 00:00:00+00',
 array['linkedin','ongoing','leadership']),

('manual', 'article',
 'About Clockwork Systems — Company Page',
 'https://clockwork.io/about-us/',
 'Official about page. Details the founding team (Stanford researchers + veteran systems engineers), company mission, and vision for redefining distributed computing for AI workloads.',
 '2025-01-01 00:00:00+00',
 array['company','reference','founding']);

-- ── Mastery Items ─────────────────────────────────────────────────────────
insert into mastery_items (category, title, priority, sort_order) values

-- AI Infrastructure
('AI Infrastructure', 'GPU cluster architecture: H100/A100 nodes, NVLink, NVSwitch topology, fat-tree networks', 'must', 1),
('AI Infrastructure', 'Distributed AI training: data/model/pipeline parallelism, FSDP — and how each stresses the fabric', 'must', 2),
('AI Infrastructure', 'NCCL: all-reduce, all-gather, reduce-scatter — how fabric congestion bottlenecks collectives', 'must', 3),
('AI Infrastructure', 'GPU utilization metrics: MFU, bubble time, straggler GPUs and why they occur', 'must', 4),
('AI Infrastructure', 'RDMA fundamentals: how RoCEv2 and InfiniBand enable zero-copy GPU-to-GPU transfers', 'high', 5),
('AI Infrastructure', 'Network congestion: tail latency, head-of-line blocking, PFC, ECN', 'high', 6),
('AI Infrastructure', 'InfiniBand vs RoCEv2: trade-offs, why hyperscalers are migrating to Ethernet', 'high', 7),

-- Clockwork Technology
('Clockwork Technology', 'PTP (IEEE 1588): how software clock sync works and why nanosecond precision is hard', 'must', 1),
('Clockwork Technology', 'FleetIQ architecture: how it instruments hosts, switches, NICs without hardware changes', 'must', 2),
('Clockwork Technology', 'One-way delay vs round-trip: why directional latency measurement matters for diagnosis', 'must', 3),
('Clockwork Technology', 'Workload fault tolerance: job continuity through GPU/node failures without full restarts', 'high', 4),
('Clockwork Technology', 'Neocloud segment: CoreWeave, Lambda Labs, Together.ai — business model and GPU utilization stakes', 'high', 5),
('Clockwork Technology', 'Competitive differentiation: software-only + heterogeneous cluster support', 'must', 6),

-- Cloud & Kubernetes
('Cloud & Kubernetes', 'Kubernetes for AI: GPU device plugins, MIG, job schedulers (Volcano, Kueue)', 'must', 1),
('Cloud & Kubernetes', 'Cloud GPU networking: AWS EFA, GCP GPUDirect Tcpx, Azure NDv5, OCI RDMA', 'high', 2),
('Cloud & Kubernetes', 'Container networking for HPC: CNI plugins, SR-IOV, DPDK', 'high', 3),
('Cloud & Kubernetes', 'Observability stack: Prometheus, Grafana, OpenTelemetry — how Clockwork fits alongside', 'high', 4),
('Cloud & Kubernetes', 'Enterprise K8s deployment: Helm charts, operators, DaemonSets for agent deployment', 'medium', 5),

-- Pre-Sales SE Craft
('Pre-Sales SE Craft', 'POC framework: scoping, success criteria, timeline, stakeholder alignment, readout structure', 'must', 1),
('Pre-Sales SE Craft', 'Technical discovery: uncover pain, quantify impact, map to Clockwork solution pillars', 'must', 2),
('Pre-Sales SE Craft', 'Demo storytelling: customer problem → before state → solution → quantified win', 'must', 3),
('Pre-Sales SE Craft', 'Objection handling: Datadog, switch restrictions, NVIDIA tooling lock-in', 'high', 4),
('Pre-Sales SE Craft', 'ROI modeling: GPU utilization % → annual dollar savings → payback period calculator', 'high', 5);
