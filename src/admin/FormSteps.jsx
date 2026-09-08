import React from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "./components";
import "./form-steps.css";

export function FormSteps({ label, steps, value, onChange, disabled = false }) {
  return (
    <nav
      className="form-steps"
      aria-label={label}
      style={{ "--step-count": steps.length }}
    >
      <ol>
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              aria-current={value === index ? "step" : undefined}
              onClick={() => onChange(index)}
              disabled={disabled}
            >
              <span className="form-step-number" aria-hidden="true">
                {step.complete ? <Check size={16} /> : index + 1}
              </span>
              <span>{step.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        Etapa {value + 1} de {steps.length}
      </p>
    </nav>
  );
}

export function StepActions({
  value,
  steps,
  onChange,
  disabled = false,
  children,
}) {
  return (
    <div className="form-step-actions">
      {value > 0 ? (
        <Button
          icon={ArrowLeft}
          onClick={() => onChange(value - 1)}
          disabled={disabled}
        >
          Voltar
        </Button>
      ) : (
        <span />
      )}
      {value < steps.length - 1 ? (
        <Button
          variant="primary"
          onClick={() => onChange(value + 1)}
          disabled={disabled}
        >
          Continuar <ArrowRight size={16} />
        </Button>
      ) : (
        children
      )}
    </div>
  );
}

export function focusStep(id) {
  requestAnimationFrame(() => {
    const heading = document.getElementById(id);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}
