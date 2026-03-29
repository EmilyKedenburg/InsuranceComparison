import { useId, useState } from 'react'
import type { ChangeEvent, FocusEvent, MouseEvent } from 'react'
import type { CoverageType, InsurancePlan } from '../types/insurance'

interface PlanFormProps {
  title: string
  plan: InsurancePlan
  isCheaper: boolean
  coverageType: CoverageType
  compact?: boolean
  condensedFourUp?: boolean
  fieldErrors?: Partial<Record<keyof InsurancePlan, string>>
  warnings?: string[]
  onRemove?: () => void
  onChange: (field: keyof InsurancePlan, value: string | number) => void
}

const numericFields: Array<{
  key: Exclude<keyof InsurancePlan, 'name'>
  label: string
  step?: string
}> = [
  { key: 'monthlyPremium', label: 'Monthly Premium' },
  { key: 'coinsurance', label: 'Coinsurance (%)', step: '1' },
  { key: 'employerContribution', label: 'Employer Contribution' },
]

const coverageFieldGroups: Array<{
  title: string
  coverageType: CoverageType
  fields: Array<{
    key:
      | 'individualDeductible'
      | 'familyDeductible'
      | 'individualOutOfPocketMax'
      | 'familyOutOfPocketMax'
    label: string
  }>
}> = [
  {
    title: 'Individual Coverage',
    coverageType: 'individual',
    fields: [
      { key: 'individualDeductible', label: 'Individual Deductible' },
      { key: 'individualOutOfPocketMax', label: 'Individual OOP Max' },
    ],
  },
  {
    title: 'Family Coverage',
    coverageType: 'family',
    fields: [
      { key: 'familyDeductible', label: 'Family Deductible' },
      { key: 'familyOutOfPocketMax', label: 'Family OOP Max' },
    ],
  },
]

export function PlanForm({
  title,
  plan,
  isCheaper,
  coverageType,
  compact = false,
  condensedFourUp = false,
  fieldErrors = {},
  warnings = [],
  onRemove,
  onChange,
}: PlanFormProps) {
  const [activeTooltip, setActiveTooltip] = useState<'hsa' | 'hra' | null>(null)
  const [draftNumbers, setDraftNumbers] = useState<Partial<Record<keyof InsurancePlan, string>>>({})
  const hsaTooltipId = useId()
  const hraTooltipId = useId()

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.name as keyof InsurancePlan, event.target.value)
  }

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    const field = name as keyof InsurancePlan

    setDraftNumbers((currentDrafts) => ({
      ...currentDrafts,
      [field]: value,
    }))

    if (value !== '') {
      onChange(field, Number(value))
    }
  }

  const handleInputFocus = (event: FocusEvent<HTMLInputElement>) => {
    event.target.select()
  }

  const handleInputClick = (event: MouseEvent<HTMLInputElement>) => {
    event.currentTarget.select()
  }

  const handleNumberBlur = (event: FocusEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    const field = name as keyof InsurancePlan

    onChange(field, value === '' ? 0 : Number(value))

    setDraftNumbers((currentDrafts) => {
      const nextDrafts = { ...currentDrafts }
      delete nextDrafts[field]
      return nextDrafts
    })
  }

  const contributionTooltips = {
    hsa: 'HSA: money deposited into a health savings account that the employee owns.',
    hra: 'HRA: employer-funded reimbursement money that is controlled by the employer.',
  }

  const renderTooltipButton = (
    label: string,
    tooltipKey: 'hsa' | 'hra',
    tooltipId: string,
    compactButton = false,
  ) => (
    <div className="relative shrink-0">
      <button
        aria-describedby={activeTooltip === tooltipKey ? tooltipId : undefined}
        aria-expanded={activeTooltip === tooltipKey}
        aria-label={`${label} help`}
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 font-semibold leading-none text-sky-700 transition hover:border-sky-300 hover:bg-sky-100 focus:border-sky-400 focus:bg-sky-100 focus:outline-none ${
          compactButton ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-[11px]'
        }`}
        tabIndex={-1}
        type="button"
        onBlur={() => setActiveTooltip(null)}
        onFocus={() => setActiveTooltip(tooltipKey)}
        onMouseEnter={() => setActiveTooltip(tooltipKey)}
        onMouseLeave={() => setActiveTooltip(null)}
      >
        i
      </button>
      <div
        aria-hidden={activeTooltip !== tooltipKey}
        aria-live="polite"
        className={`absolute bottom-full left-1/2 z-10 mb-3 w-64 -translate-x-1/2 rounded-2xl border border-sky-100 bg-sky-50/95 px-3 py-2 text-xs leading-5 text-slate-700 shadow-lg shadow-slate-200/50 backdrop-blur transition-opacity duration-150 ease-out ${
          activeTooltip === tooltipKey
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
        id={tooltipId}
        role={activeTooltip === tooltipKey ? 'tooltip' : undefined}
      >
        {contributionTooltips[tooltipKey]}
        <span className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-sky-100 bg-sky-50/95" />
      </div>
    </div>
  )

  return (
    <section
      className={`min-w-0 rounded-3xl border p-6 shadow-sm transition ${
        isCheaper
          ? 'border-emerald-400 bg-emerald-50/80'
          : 'border-slate-200 bg-white/80'
      }`}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            {title}
          </p>
          <h2 className="text-xl font-semibold text-slate-900">{plan.name}</h2>
        </div>
        <div
          className={`flex gap-2 ${
            compact ? 'flex-col items-end' : 'items-center'
          }`}
        >
          {onRemove ? (
            <button
              className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              tabIndex={-1}
              type="button"
              onClick={onRemove}
            >
              Remove Plan
            </button>
          ) : null}
          {compact ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isCheaper
                  ? 'bg-emerald-600 text-white'
                  : 'invisible'
              }`}
            >
              Lower Total Cost
            </span>
          ) : isCheaper ? (
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
              Lower Total Cost
            </span>
          ) : null}
        </div>
      </div>

      <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
        <label className="min-w-0 sm:col-span-2">
          <span className="mb-2 block text-sm font-medium text-slate-700">
            Plan Name
          </span>
          <input
            aria-invalid={Boolean(fieldErrors.name)}
            className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
              fieldErrors.name ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
            }`}
            name="name"
            type="text"
            value={plan.name}
            onChange={handleTextChange}
            onClick={handleInputClick}
            onFocus={handleInputFocus}
          />
          {fieldErrors.name ? (
            <p className="mt-2 text-sm text-rose-600">{fieldErrors.name}</p>
          ) : null}
        </label>

        {numericFields.map((field) => (
          <label key={field.key} className="min-w-0">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              {field.label}
            </span>
            <input
              aria-invalid={Boolean(fieldErrors[field.key])}
              className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
                fieldErrors[field.key]
                  ? 'border-rose-400 bg-rose-50'
                  : 'border-slate-200'
              }`}
              min="0"
              name={field.key}
              step={field.step ?? '0.01'}
              type="number"
              value={draftNumbers[field.key] ?? plan[field.key]}
              onChange={handleNumberChange}
              onBlur={handleNumberBlur}
              onClick={handleInputClick}
              onFocus={handleInputFocus}
            />
            {fieldErrors[field.key] ? (
              <p className="mt-2 text-sm text-rose-600">{fieldErrors[field.key]}</p>
            ) : null}
          </label>
        ))}

        <div className={`min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 ${compact ? '' : 'sm:col-span-2'}`}>
          <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
            {([
              ['hsaContribution', 'HSA Contribution', 'hsa', hsaTooltipId],
              ['hraContribution', 'HRA Contribution', 'hra', hraTooltipId],
            ] as const).map(([key, label, tooltipKey, tooltipId]) => (
              <label key={key} className="min-w-0">
                <div
                  className={`relative mb-2 min-h-5 ${
                    condensedFourUp
                      ? 'flex flex-col items-start'
                      : 'flex items-center gap-1.5'
                  }`}
                >
                  {condensedFourUp ? (
                    <div className="flex flex-col items-start text-sm font-medium text-slate-700">
                      <span className="inline-flex items-center gap-1 leading-4">
                        <span>{label.split(' ')[0]}</span>
                        {renderTooltipButton(label, tooltipKey, tooltipId, true)}
                      </span>
                      <span className="leading-4">{label.split(' ').slice(1).join(' ')}</span>
                    </div>
                  ) : (
                    <span className="text-sm font-medium leading-5 text-slate-700">
                      {label}
                    </span>
                  )}
                  {!condensedFourUp ? (
                    renderTooltipButton(label, tooltipKey, tooltipId, compact)
                  ) : null}
                </div>
                <input
                  aria-label={label}
                  aria-invalid={Boolean(fieldErrors[key])}
                  className={`w-full rounded-2xl border bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-sky-500 ${
                    fieldErrors[key]
                      ? 'border-rose-400 bg-rose-50'
                      : 'border-slate-200'
                  }`}
                  min="0"
                  name={key}
                  step="0.01"
                  type="number"
                  value={draftNumbers[key] ?? plan[key]}
                  onChange={handleNumberChange}
                  onBlur={handleNumberBlur}
                  onClick={handleInputClick}
                  onFocus={handleInputFocus}
                />
                {fieldErrors[key] ? (
                  <p className="mt-2 text-sm text-rose-600">{fieldErrors[key]}</p>
                ) : null}
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Note: Some plans do not allow both HSA and HRA simultaneously.
          </p>
        </div>

        {coverageFieldGroups.map((group) => {
          const isActive = coverageType === group.coverageType

          return (
            <div
              key={group.title}
              className={`min-w-0 rounded-2xl border p-4 ${compact ? '' : 'sm:col-span-2'} ${
                isActive
                  ? 'border-sky-200 bg-sky-50/70'
                  : 'border-slate-200 bg-slate-50 text-slate-400'
              }`}
            >
              <p
                className={`mb-3 font-semibold uppercase ${
                  compact ? 'text-xs tracking-[0.12em]' : 'text-sm tracking-[0.16em]'
                } ${isActive ? 'text-sky-700' : 'text-slate-400'}`}
              >
                {group.title}
              </p>
              <div className={`grid gap-4 ${compact ? '' : 'sm:grid-cols-2'}`}>
                {group.fields.map((field) => (
                  <label key={field.key} className="min-w-0">
                    <span
                      className={`mb-2 block text-sm font-medium ${
                        isActive ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      {field.label}
                    </span>
                    <input
                      aria-invalid={isActive && Boolean(fieldErrors[field.key])}
                      className={`w-full rounded-2xl border px-4 py-3 outline-none transition ${
                        !isActive
                          ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                          : fieldErrors[field.key]
                            ? 'border-rose-400 bg-rose-50 text-slate-900 focus:border-sky-500'
                            : 'border-slate-200 bg-white text-slate-900 focus:border-sky-500'
                      }`}
                      disabled={!isActive}
                      min="0"
                      name={field.key}
                      step="0.01"
                      type="number"
                      value={draftNumbers[field.key] ?? plan[field.key]}
                      onChange={handleNumberChange}
                      onBlur={handleNumberBlur}
                      onClick={handleInputClick}
                      onFocus={handleInputFocus}
                    />
                    {isActive && fieldErrors[field.key] ? (
                      <p className="mt-2 text-sm text-rose-600">{fieldErrors[field.key]}</p>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </section>
  )
}
