{{- define "secureops.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "secureops.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "secureops.labels" -}}
helm.sh/chart: {{ include "secureops.name" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}

{{- define "secureops.selectorLabels" -}}
app.kubernetes.io/name: {{ include "secureops.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "secureops.secretName" -}}
{{- if .Values.secrets.create }}
{{- printf "%s-secrets" (include "secureops.fullname" .) }}
{{- else }}
{{- .Values.secrets.existingSecret | default "secureops-secrets" }}
{{- end }}
{{- end }}

{{- define "secureops.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- printf "%s-%s" (include "secureops.fullname" .) .component }}
{{- else }}
{{- default "default" .serviceAccountName }}
{{- end }}
{{- end }}

{{- define "secureops.kafkaBrokers" -}}
{{- if and .Values.kafkaExternal .Values.kafkaExternal.enabled }}
{{- .Values.kafkaExternal.brokers }}
{{- else }}
{{- printf "%s-kafka:9092" (include "secureops.fullname" .) }}
{{- end }}
{{- end }}

{{- define "secureops.kafkaEnv" -}}
- name: KAFKA_BROKERS
  value: {{ include "secureops.kafkaBrokers" . | quote }}
{{- if and .Values.kafkaExternal .Values.kafkaExternal.enabled }}
{{- if .Values.kafkaExternal.securityProtocol }}
- name: KAFKA_SECURITY_PROTOCOL
  value: {{ .Values.kafkaExternal.securityProtocol | quote }}
{{- end }}
{{- if .Values.kafkaExternal.saslMechanism }}
- name: KAFKA_SASL_MECHANISM
  value: {{ .Values.kafkaExternal.saslMechanism | quote }}
{{- end }}
{{- if .Values.kafkaExternal.saslJaasConfig }}
- name: KAFKA_SASL_JAAS_CONFIG
  valueFrom:
    secretKeyRef:
      name: {{ include "secureops.secretName" . }}
      key: kafka-sasl-jaas-config
      optional: true
{{- end }}
{{- if .Values.kafkaExternal.sslEnabled }}
- name: KAFKA_SSL_ENABLED
  value: "true"
{{- end }}
{{- end }}
{{- end }}

{{- define "secureops.objectStorageEnv" -}}
- name: CLOUD_STORAGE_PROVIDER
  value: {{ .Values.objectStorage.provider | default "s3" | quote }}
- name: CLOUD_STORAGE_BUCKET
  value: {{ .Values.objectStorage.bucket | default "secureops-events" | quote }}
- name: CLOUD_STORAGE_REGION
  value: {{ .Values.objectStorage.region | default "us-east-1" | quote }}
{{- if .Values.objectStorage.endpoint }}
- name: CLOUD_STORAGE_ENDPOINT
  value: {{ .Values.objectStorage.endpoint | quote }}
{{- end }}
{{- if .Values.objectStorage.forcePathStyle }}
- name: CLOUD_STORAGE_FORCE_PATH_STYLE
  value: "true"
{{- end }}
{{- end }}

{{- define "secureops.federationEnv" -}}
{{- if and .Values.dataPlane .Values.dataPlane.federation .Values.dataPlane.federation.enabled }}
- name: DATA_PLANE_ENDPOINTS
  value: {{ .Values.dataPlane.federation.dataPlaneEndpointsJson | quote }}
{{- end }}
{{- if .Values.global.dataPlaneId }}
- name: DATA_PLANE_ID
  value: {{ .Values.global.dataPlaneId | quote }}
{{- end }}
{{- if .Values.global.managementPlaneUrl }}
- name: MANAGEMENT_PLANE_URL
  value: {{ .Values.global.managementPlaneUrl | quote }}
{{- end }}
{{- end }}

{{- define "secureops.sslEnv" -}}
{{- if and .Values.ssl .Values.ssl.dbSslCa }}
- name: DB_SSL_CA
  value: {{ .Values.ssl.dbSslCa | quote }}
- name: PGSSLROOTCERT
  value: {{ .Values.ssl.dbSslCa | quote }}
- name: NODE_EXTRA_CA_CERTS
  value: {{ .Values.ssl.nodeExtraCaCerts | default .Values.ssl.dbSslCa | quote }}
- name: PGSSLMODE
  value: {{ .Values.ssl.pgSslMode | default "verify-ca" | quote }}
{{- end }}
{{- end }}

{{- define "secureops.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecrets }}
imagePullSecrets:
{{- toYaml .Values.global.imagePullSecrets | nindent 2 }}
{{- end }}
{{- end }}
