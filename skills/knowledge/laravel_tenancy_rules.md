---
topic: laravel_tenancy_rules
keywords: [tenancy, tenant, scope, organization, account, billing]
requires_tools: [Read, Grep]
token_cost: 120
---
Never cross tenant boundaries implicitly. Read the existing tenant resolver and policy pattern first. Queries need explicit tenant scope or documented global intent. Jobs must carry tenant context. Tests must prove isolation for cross-tenant data.
