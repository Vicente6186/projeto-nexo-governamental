/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

const autoResizeTextareas = document.querySelectorAll('textarea[data-auto-resize]');
const contactForm = document.querySelector('#contact-form');
const resizeTextarea = textarea => {
  const styles = window.getComputedStyle(textarea);
  const maxHeight = parseFloat(styles.maxHeight) || Number(textarea.dataset.maxHeight) || 240;
  const borderHeight = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight + borderHeight, maxHeight)}px`;
};
autoResizeTextareas.forEach(textarea => {
  resizeTextarea(textarea);
  textarea.addEventListener('input', () => resizeTextarea(textarea));
});
window.addEventListener('resize', () => {
  autoResizeTextareas.forEach(resizeTextarea);
});
if (contactForm) {
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(contactForm);
    const recipient = contactForm.dataset.recipient;
    const name = formData.get('name')?.toString().trim() || '';
    const email = formData.get('email')?.toString().trim() || '';
    const college = formData.get('college')?.toString().trim() || '';
    const description = formData.get('description')?.toString().trim() || '';
    const subject = `Contato pelo site - ${name || 'Sem nome'}`;
    const body = ['Nova mensagem enviada pelo site Nexo Governamental.', '', `Nome: ${name}`, `E-mail: ${email}`, `Faculdade: ${college}`, '', 'Mensagem:', description].join('\n');
    window.location.href = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}
/******/ })()
;