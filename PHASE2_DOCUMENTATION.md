# Phase 2: Evidence Ingestion & File Handling - Documentation

## Overview

Phase 2 adds comprehensive file handling capabilities to the evidence management platform, including file uploads, metadata extraction, background processing, and enhanced chain of custody features.

## New Features

### File Upload System

#### Multiple Upload Methods

1. **Standard Upload** - Direct file upload with metadata
2. **Chunked Upload** - For large files (100MB+)
3. **S3 Direct Upload** - Cloud storage with presigned URLs

#### File Processing Pipeline

```
File Upload → Virus Scan → Hash Calculation → Metadata Extraction → Thumbnail Generation → Chain of Custody Update
```

#### Supported File Types

- **Images**: JPEG, PNG, GIF, WebP, TIFF
- **Videos**: MP4, AVI, MOV, WMV
- **Audio**: MP3, WAV, AAC, OGG
- **Documents**: PDF, DOC, DOCX, XLS, XLSX, TXT, CSV
- **Archives**: ZIP, RAR, 7Z

### API Endpoints

#### File Upload

```bash
# Standard file upload
POST /api/v1/evidence-files/upload
Content-Type: multipart/form-data

{
  "caseId": "case_id",
  "title": "Evidence Title",
  "description": "Optional description",
  "type": "PHOTO",
  "location": "Crime Scene",
  "tags": ["fingerprint", "weapon"],
  "files": [file1, file2, ...]
}

# Response
{
  "success": true,
  "data": {
    "evidenceItems": [
      {
        "id": "evidence_id",
        "itemNumber": "CASE-001-E001",
        "title": "Evidence Title",
        "filename": "original_filename.jpg",
        "size": 1024000,
        "hash": "sha256_hash",
        "processingStatus": "queued"
      }
    ],
    "caseId": "case_id"
  }
}
```

#### S3 Presigned URL

```bash
# Get presigned URL for direct S3 upload
POST /api/v1/evidence-files/upload/s3/presigned

{
  "filename": "evidence.jpg",
  "contentType": "image/jpeg",
  "size": 1024000
}

# Response
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "key": "evidence/2024/01/evidence.jpg",
    "expiresIn": 3600,
    "maxSize": 104857600
  }
}
```

#### Chunked Upload

```bash
# Upload file chunks
POST /api/v1/evidence-files/upload/chunk

{
  "uploadId": "unique_upload_id",
  "chunkIndex": 0,
  "totalChunks": 5,
  "caseId": "case_id",
  "filename": "large_video.mp4",
  "totalSize": 524288000,
  "chunk": [binary_data]
}

# Response - Chunk received
{
  "success": true,
  "data": {
    "complete": false,
    "uploadId": "unique_upload_id",
    "chunkIndex": 0,
    "totalChunks": 5,
    "message": "Chunk 1 of 5 received"
  }
}

# Response - Upload complete
{
  "success": true,
  "data": {
    "complete": true,
    "evidenceId": "evidence_id",
    "itemNumber": "CASE-001-E002",
    "message": "Chunked upload completed successfully"
  }
}
```

#### Chain of Custody

```bash
# Request custody transfer
POST /api/v1/evidence-files/{evidenceId}/transfer

{
  "toUserId": "user_id",
  "reason": "Forensic analysis",
  "location": "Lab B",
  "approvalRequired": true,
  "approvers": ["supervisor_id", "admin_id"],
  "scheduledAt": "2024-01-15T10:00:00Z",
  "notes": "Send to digital forensics team"
}

# Approve/reject transfer
POST /api/v1/evidence-files/transfers/{transferId}/approve
POST /api/v1/evidence-files/transfers/{transferId}/reject

{
  "notes": "Approved for forensic analysis"
}

# Verify file integrity
POST /api/v1/evidence-files/{evidenceId}/verify

{
  "filePath": "/path/to/evidence/file" // Optional
}

# Response
{
  "success": true,
  "data": {
    "verification": {
      "evidenceId": "evidence_id",
      "verified": true,
      "currentHash": "current_sha256",
      "originalHash": "original_sha256",
      "algorithm": "SHA-256",
      "verifiedAt": "2024-01-10T15:30:00Z"
    }
  }
}
```

#### Processing Status

```bash
# Get processing status
GET /api/v1/evidence-files/{evidenceId}/processing-status

# Response
{
  "success": true,
  "data": {
    "evidenceId": "evidence_id",
    "processing": {
      "status": "completed",
      "progress": 100,
      "startTime": "2024-01-10T15:00:00Z",
      "endTime": "2024-01-10T15:02:30Z",
      "metadata": {
        "hash": "file_hash",
        "virusScan": {
          "clean": true,
          "engine": "ClamAV",
          "scanTime": "2024-01-10T15:00:15Z"
        },
        "thumbnails": ["thumb_150.jpg", "thumb_300.jpg"],
        "exif": {
          "dateTime": "2024-01-08T12:30:00",
          "gps": {
            "latitude": 40.7128,
            "longitude": -74.0060
          },
          "camera": {
            "make": "Canon",
            "model": "EOS 5D Mark IV"
          }
        }
      }
    }
  }
}
```

### Configuration

#### Environment Variables

```bash
# File Upload Configuration
MAX_FILE_SIZE=104857600                    # 100MB
UPLOAD_PATH="./uploads"

# AWS/S3 Configuration (Optional)
AWS_REGION="us-east-1"
AWS_ACCESS_KEY_ID="your_access_key"
AWS_SECRET_ACCESS_KEY="your_secret_key"
AWS_S3_BUCKET="your-evidence-bucket"

# Email/SMTP Configuration (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER="your_email@domain.com"
SMTP_PASS="your_app_password"
SMTP_FROM="Evidence Platform <noreply@yourplatform.com>"
```

### Background Processing

#### File Processing Jobs

Files are automatically queued for background processing after upload:

1. **Virus Scanning** - ClamAV integration (if available)
2. **Hash Calculation** - SHA-256 for integrity verification
3. **Metadata Extraction** - EXIF, video metadata, PDF content
4. **Thumbnail Generation** - Multiple sizes for images/videos
5. **Duplicate Detection** - Based on file hashes
6. **Chain of Custody Update** - Automatic audit trail

#### Job Progress Tracking

Real-time progress notifications via WebSocket:

```javascript
// Client-side WebSocket connection
socket.on('job-progress', (data) => {
  console.log(`Job ${data.jobId}: ${data.progress}% complete`);
});

socket.on('evidence-file-processed', (data) => {
  if (data.status === 'completed') {
    console.log('File processing completed:', data.metadata);
  } else if (data.status === 'failed') {
    console.error('File processing failed:', data.error);
  }
});
```

### Chain of Custody Enhancements

#### Digital Signatures

All custody entries are automatically signed with RSA digital signatures:

```json
{
  "id": "custody_entry_id",
  "action": "UPLOADED",
  "userId": "user_id",
  "timestamp": "2024-01-10T15:00:00Z",
  "location": "Evidence Room",
  "notes": "File uploaded: evidence.jpg",
  "digitalSignature": "base64_encoded_signature",
  "integrityCheck": {
    "hash": "sha256_hash",
    "algorithm": "SHA-256",
    "verified": true,
    "timestamp": "2024-01-10T15:00:00Z"
  }
}
```

#### Multi-Party Approval Workflow

Complex custody transfers can require multiple approvals:

```json
{
  "transferId": "transfer_id",
  "evidenceId": "evidence_id",
  "fromUserId": "user1",
  "toUserId": "user2",
  "status": "PENDING_APPROVAL",
  "approvals": [
    {
      "userId": "supervisor_id",
      "status": "APPROVED",
      "timestamp": "2024-01-10T16:00:00Z",
      "notes": "Approved for forensic analysis"
    },
    {
      "userId": "admin_id",
      "status": "PENDING",
      "timestamp": null,
      "notes": null
    }
  ]
}
```

#### Automated Email Notifications

Custody changes trigger automatic email notifications:

```html
<h2>Chain of Custody Alert</h2>
<p><strong>Case Number:</strong> CASE-001</p>
<p><strong>Evidence Item:</strong> CASE-001-E001</p>
<p><strong>Action:</strong> CUSTODY_TRANSFERRED</p>
<p><strong>User:</strong> investigator@agency.gov</p>
<p><strong>Timestamp:</strong> 2024-01-10T15:00:00Z</p>
<p><strong>Location:</strong> Digital Forensics Lab</p>
<p><strong>Status:</strong> Digitally Signed ✓</p>
```

### Scheduled Maintenance

#### Automatic Cleanup Jobs

- **Daily 2 AM** - Clean up temporary files older than 24 hours
- **Weekly Sunday 3 AM** - Archive old files from closed cases
- **Daily 1 AM** - Update database statistics
- **Hourly** - Clean up failed queue jobs
- **Every 6 hours** - Random integrity checks on evidence files
- **Daily 6 AM** - Generate processing reports

#### Manual Administration

```bash
# Get job queue statistics
GET /api/v1/evidence-files/jobs/stats

# Response
{
  "success": true,
  "data": {
    "jobStats": {
      "waiting": 5,
      "active": 2,
      "completed": 150,
      "failed": 3,
      "total": 160
    }
  }
}
```

### Security Features

#### File Validation

- **Magic byte detection** - Verify file types by content, not extension
- **Size limits** - Configurable maximum file sizes
- **Virus scanning** - ClamAV integration for malware detection
- **Duplicate detection** - SHA-256 hash comparison

#### Access Control

- **Role-based permissions** - `evidence:create`, `evidence:transfer`, `evidence:verify`
- **Rate limiting** - 10 uploads per minute per user
- **Audit logging** - All file operations logged with user attribution

#### Data Integrity

- **Cryptographic hashes** - SHA-256 for all files
- **Digital signatures** - RSA signatures for custody entries
- **Immutable audit trail** - PostgreSQL JSONB storage
- **Regular integrity checks** - Automated verification of file hashes

### Error Handling

#### Common Error Codes

- `FILE_TOO_LARGE` - File exceeds maximum size limit
- `INVALID_FILE_TYPE` - File type not allowed
- `VIRUS_DETECTED` - File failed virus scan
- `UPLOAD_FAILED` - General upload failure
- `PROCESSING_FAILED` - Background processing error
- `TRANSFER_FAILED` - Custody transfer error
- `VERIFICATION_FAILED` - Integrity verification error

#### Retry Mechanisms

- **File processing** - 3 attempts with exponential backoff
- **Email notifications** - 3 attempts with fixed delay
- **Integrity checks** - 2 attempts with 10-second delay

### Performance Optimization

#### File Processing

- **Parallel processing** - Up to 3 concurrent file processing jobs
- **Thumbnail caching** - Multiple sizes generated once
- **Progressive JPEG** - Optimized image formats
- **Video thumbnails** - 10% timestamp for consistent preview

#### Storage

- **Local storage** - Fast access for active files
- **S3 integration** - Scalable cloud storage option
- **Cleanup jobs** - Automatic removal of old temporary files

### Troubleshooting

#### Common Issues

1. **ClamAV not available** - Virus scanning disabled, files marked as clean
2. **FFmpeg missing** - Video processing skipped, basic metadata only
3. **S3 credentials invalid** - Falls back to local storage
4. **SMTP not configured** - Email notifications disabled

#### Monitoring

- **Structured logging** - All operations logged with correlation IDs
- **WebSocket events** - Real-time progress notifications
- **Queue monitoring** - Job statistics and failure rates
- **Health checks** - Service availability monitoring

### Migration from Phase 1

#### Database Changes

New database table added:

```sql
CREATE TABLE "custody_transfers" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "notes" TEXT,
    "approvers" JSONB NOT NULL,
    "approvals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_transfers_pkey" PRIMARY KEY ("id")
);
```

#### Existing Data

All existing evidence items will continue to work normally. New features are additive and don't require data migration.

## Next Steps (Phase 3+)

- Mobile app integration
- Advanced forensic analysis tools
- Machine learning for automatic classification
- Integration with external forensic tools
- Blockchain-based immutable audit trails