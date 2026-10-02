interface FieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  /** Outline the field as a problem without showing a message */
  invalid?: boolean
  required?: boolean
  multiline?: boolean
  rows?: number
  placeholder?: string
  hint?: string
  type?: string
  disabled?: boolean
  full?: boolean
}

export default function Field({
  id, label, value, onChange, onBlur, error, invalid, required, multiline, rows = 4,
  placeholder, hint, type = 'text', disabled, full,
}: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const common = {
    id,
    value,
    placeholder,
    disabled,
    onBlur,
    'aria-invalid': error || invalid ? true : undefined,
    'aria-describedby': describedBy,
  }

  return (
    <div className={`form-group${error || invalid ? ' has-error' : ''}${full ? ' full-width' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
      {error ? (
        <span id={`${id}-error`} className="field-error" role="alert">{error}</span>
      ) : hint ? (
        <span id={`${id}-hint`} className="field-hint">{hint}</span>
      ) : null}
    </div>
  )
}
