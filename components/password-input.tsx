"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

/** A password field with a show/hide toggle inside its right edge. Takes the usual input props. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative flex">
      <input {...props} type={show ? "text" : "password"} className={`field-input pr-11 ${props.className ?? ""}`} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"} aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-slate-400 hover:text-ink">
        {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
      </button>
    </span>
  );
}
