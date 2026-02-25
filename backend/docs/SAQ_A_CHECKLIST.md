# SAQ A - Payment Card Industry Self-Assessment Questionnaire

## Part 1: Assessment Information

**Merchant Name:** Your Coffee Shop SaaS
**Merchant DBA:** Your Company
**Contact:** security@company.com
**Date:** 2024-XX-XX

## Part 2: Compliance Validation

### Requirement 1: Install and maintain a firewall configuration

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1.1 | Firewall standards established | ✅ | AWS Security Groups configured |
| 1.2 | Firewall rules documented | ✅ | See firewall-rules.md |
| 1.3 | DMZ implemented | ✅ | Public/private subnet separation |

### Requirement 2: Do not use vendor-supplied defaults

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 2.1 | Default passwords changed | ✅ | Password policy enforced |
| 2.2 | Unnecessary services disabled | ✅ | Minimal Docker containers |
| 2.3 | Encryption enabled | ✅ | TLS 1.2+ enforced |

### Requirement 3: Protect stored cardholder data

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 3.1 | Data retention policy | ✅ | No card data stored |
| 3.2 | Sensitive data not stored | ✅ | Only tokens stored |
| 3.3 | PAN masked when displayed | ✅ | Only last 4 digits shown |
| 3.4 | PAN unreadable | N/A | We don't store PAN |

### Requirement 4: Encrypt transmission

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 4.1 | Strong cryptography for transmission | ✅ | TLS 1.2+ |
| 4.2 | Never send unencrypted PANs | ✅ | Tokenization only |

### Requirement 5: Protect against malware

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 5.1 | Antivirus deployed | ✅ | Server-level protection |
| 5.2 | Antivirus updated | ✅ | Automatic updates |

### Requirement 6: Develop secure systems

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 6.1 | Security patches applied | ✅ | Monthly updates |
| 6.2 | Secure development practices | ✅ | Code review process |
| 6.3 | Input validation | ✅ | Zod schemas |

### Requirement 7: Restrict access

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 7.1 | Access limited to need-to-know | ✅ | RBAC implemented |
| 7.2 | Access control system | ✅ | JWT + roles |

### Requirement 8: Identify users

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 8.1 | Unique user IDs | ✅ | UUID per user |
| 8.2 | Strong authentication | ✅ | Password + 2FA |
| 8.3 | Multi-factor authentication | ⚠️ | Recommended for admins |

### Requirement 9: Restrict physical access

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 9.1 | Physical access controls | ✅ | Cloud provider (AWS) |
| 9.2 | Visitor logs | ✅ | AWS CloudTrail |

### Requirement 10: Track and monitor access

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 10.1 | Audit trails | ✅ | PaymentAuditSnapshot |
| 10.2 | Automated audit trails | ✅ | Automatic logging |
| 10.3 | Logs secured | ✅ | Read-only logs |
| 10.4 | Logs reviewed | ✅ | Daily review process |

### Requirement 11: Regularly test security

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 11.1 | Wireless access points tested | N/A | No wireless |
| 11.2 | Vulnerability scans (quarterly) | ✅ | Scheduled scans |
| 11.3 | Penetration testing (annually) | 📅 | Planned |

### Requirement 12: Maintain security policy

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 12.1 | Security policy established | ✅ | SECURITY_POLICY.md |
| 12.2 | Risk assessment (annually) | 📅 | Planned |
| 12.3 | Acceptable use policy | ✅ | AUP documented |

## Attestation

**I certify that:**
- I have read and understand the PCI DSS requirements
- Our payment system complies with SAQ A requirements
- We use only PCI DSS validated payment providers
- We do not store, process, or transmit cardholder data

**Signed:** ________________
**Date:** ________________
**Title:** ________________
