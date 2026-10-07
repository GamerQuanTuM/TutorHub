"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

/** Staggered entrance for a group of children (use <RevealItem> inside). Triggers once on scroll. */
export function RevealGroup({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "ul" | "ol" }) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-40px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </Tag>
  );
}

export function RevealItem({ children, className, as = "div" }: { children: React.ReactNode; className?: string; as?: "div" | "li" }) {
  const Tag = motion[as];
  return (
    <Tag className={cn(className)} variants={item}>
      {children}
    </Tag>
  );
}
