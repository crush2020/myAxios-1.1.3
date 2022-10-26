
  let resolvePromise
const promise1 = new Promise(function promiseExecutor(resolve) {
  resolvePromise = resolve;
});

console.log(promise1)
promise1.then((abd) => {
  console.log(abd)
})
