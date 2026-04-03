/******/ (() => { // webpackBootstrap
/******/ 	"use strict";

const autoResizeTextareas = document.querySelectorAll('textarea[data-auto-resize]');
const contactForm = document.querySelector('#contact-form');
const resizeTextarea = textarea => {
  const maxHeight = Number(textarea.dataset.maxHeight) || 240;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
};
autoResizeTextareas.forEach(textarea => {
  resizeTextarea(textarea);
  textarea.addEventListener('input', () => resizeTextarea(textarea));
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